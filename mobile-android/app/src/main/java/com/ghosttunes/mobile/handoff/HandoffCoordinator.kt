package com.ghosttunes.mobile.handoff

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.ghosttunes.mobile.data.model.DesktopState
import com.ghosttunes.mobile.data.model.HandoffSnapshot
import com.ghosttunes.mobile.data.model.PushRequest
import com.ghosttunes.mobile.data.model.ReleaseRequest
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.GhosttunesApi
import com.ghosttunes.mobile.playback.PlaybackConnection
import com.ghosttunes.mobile.playback.fadeOutAndPause
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

sealed interface HandoffStatus {
    val message: String
    val terminal: Boolean

    data class Working(override val message: String) : HandoffStatus { override val terminal = false }
    data class Done(override val message: String) : HandoffStatus { override val terminal = true }
    data class Failed(override val message: String) : HandoffStatus { override val terminal = true }
}

/**
 * Moves playback between this phone and Ghosttunes on the PC (serverHandoff.js protocol).
 * PUSH when the phone is playing, PULL when it isn't.
 */
@Singleton
class HandoffCoordinator @Inject constructor(
    private val context: Context,
    private val api: GhosttunesApi,
    private val playback: PlaybackConnection,
    private val scope: CoroutineScope,
    private val locator: com.ghosttunes.mobile.data.net.PcLocator,
) {
    /** One-shot events that drive the transfer animation. */
    sealed interface Transfer {
        val track: Track
        data class ToPc(override val track: Track) : Transfer
        data class ToPhone(override val track: Track) : Transfer
    }
    private val _transfers = kotlinx.coroutines.flow.MutableSharedFlow<Transfer>(extraBufferCapacity = 4)
    val transfers: kotlinx.coroutines.flow.SharedFlow<Transfer> = _transfers

    private val _status = MutableStateFlow<HandoffStatus?>(null)
    val status: StateFlow<HandoffStatus?> = _status
    private var lastTriggerAt = 0L
    private var job: Job? = null
    private var clearJob: Job? = null

    val deviceName: String
        get() {
            val model = Build.MODEL.orEmpty()
            val maker = Build.MANUFACTURER.orEmpty().replaceFirstChar { it.uppercase() }
            return if (model.startsWith(maker, ignoreCase = true)) model else "$maker $model".trim()
        }

    /** Debounced (NFC can fire twice; flick + button within 4 s count once). */
    fun trigger(source: String): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (now - lastTriggerAt < DEBOUNCE_MS || job?.isActive == true) return false
        lastTriggerAt = now
        Log.i(TAG, "trigger from $source")
        job = scope.launch { run() }
        return true
    }

    private fun show(status: HandoffStatus?) {
        clearJob?.cancel()
        _status.value = status
        if (status?.terminal == true) {
            clearJob = scope.launch { delay(3_200); if (_status.value === status) _status.value = null }
        }
    }

    private suspend fun run() {
        try {
            // Make sure we know where the PC is on this network (re-finds it if its address changed).
            if (locator.ensure(allowScan = false) == null) {
                show(HandoffStatus.Working("Looking for your PC…"))
                if (locator.ensure(allowScan = true) == null) {
                    show(HandoffStatus.Failed(DESKTOP_OFFLINE))
                    return
                }
            }
            val controller = playback.controller()
            val (playing, current) = withContext(Dispatchers.Main) { controller.isPlaying to controller.currentMediaItem }
            if (playing && current != null) push() else pull()
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            show(HandoffStatus.Failed(UNREACHABLE))
        } catch (e: Exception) {
            Log.w(TAG, "handoff failed", e)
            show(HandoffStatus.Failed(UNREACHABLE))
        }
    }

    // ------------------------------------------------------------------ PUSH

    private suspend fun push() {
        show(HandoffStatus.Working("Sending to PC…"))
        val controller = playback.controller()
        val state = playback.state.value
        val (index, positionSec) = withContext(Dispatchers.Main) {
            controller.currentMediaItemIndex to controller.currentPosition / 1000.0
        }
        val snapshot = buildSnapshot(state.queue, index, positionSec, deviceName) ?: run {
            show(HandoffStatus.Failed("Nothing to send."))
            return
        }

        val response = withContext(Dispatchers.IO) { api.push(PushRequest(snapshot)) }
        if (response.code() == 409) {
            show(HandoffStatus.Failed(DESKTOP_OFFLINE))
            return
        }
        val id = response.body()?.id
        if (!response.isSuccessful || id == null) {
            show(HandoffStatus.Failed(UNREACHABLE))
            return
        }

        // Keep playing while the PC loads; poll every 300 ms for up to 15 s.
        val result = withTimeoutOrNull(PUSH_TIMEOUT_MS) {
            while (true) {
                delay(300)
                val s = runCatching { withContext(Dispatchers.IO) { api.handoffStatus(id) } }.getOrNull() ?: continue
                if (s.status == "playing" || s.status == "failed") return@withTimeoutOrNull s
            }
            @Suppress("UNREACHABLE_CODE") null
        }
        when (result?.status) {
            "playing" -> {
                _transfers.tryEmit(Transfer.ToPc(snapshot.track))
                withContext(Dispatchers.Main) { fadeOutAndPause(controller, 900) }
                context.vibrate(20)
                show(HandoffStatus.Done("Now playing on your PC"))
            }
            "failed" -> show(HandoffStatus.Failed("Your PC couldn't play this song."))
            else -> {
                runCatching { withContext(Dispatchers.IO) { api.release(ReleaseRequest("timeout")) } }
                show(HandoffStatus.Failed("Your PC didn't start playing in time."))
            }
        }
    }

    // ------------------------------------------------------------------ PULL

    private suspend fun pull() {
        show(HandoffStatus.Working("Checking your PC…"))
        val desktop: DesktopState = withContext(Dispatchers.IO) { api.desktop() }
        val receivedAt = SystemClock.elapsedRealtime()
        if (!desktop.online) {
            show(HandoffStatus.Failed(DESKTOP_OFFLINE))
            return
        }
        val np = desktop.nowPlaying
        if (np == null || !np.isPlaying) {
            show(HandoffStatus.Failed("Nothing is playing on your PC."))
            return
        }
        show(HandoffStatus.Working("Moving to your phone…"))
        val queue = np.queue.ifEmpty { listOf(np.track) }
        val index = queue.indexOfFirst { it.id == np.track.id }.takeIf { it >= 0 } ?: 0
        fun target() = np.position + (SystemClock.elapsedRealtime() - receivedAt) / 1000.0
        val controller = playback.controller()
        playback.playAndAwait(queue, index, ((target() + START_LATENCY_SEC) * 1000).toLong())

        // Wait until ExoPlayer is actually playing this track, then land on the exact second.
        val started = withTimeoutOrNull(PULL_TIMEOUT_MS) {
            while (true) {
                val ok = withContext(Dispatchers.Main) { controller.isPlaying && controller.currentMediaItem?.mediaId == np.track.id }
                if (ok) return@withTimeoutOrNull true
                delay(100)
            }
            @Suppress("UNREACHABLE_CODE") false
        } ?: false
        if (!started) {
            show(HandoffStatus.Failed("Couldn't start playback on your phone."))
            return
        }
        withContext(Dispatchers.Main) {
            val wantMs = (target() * 1000).toLong()
            if (abs(controller.currentPosition - wantMs) > 250) controller.seekTo(wantMs)
        }
        runCatching { withContext(Dispatchers.IO) { api.release(ReleaseRequest("pulled")) } }
        _transfers.tryEmit(Transfer.ToPhone(np.track))
        context.vibrate(20)
        show(HandoffStatus.Done("Moved to your phone"))
    }

    companion object {
        private const val TAG = "GhosttunesHandoff"
        const val DEBOUNCE_MS = 4_000L
        const val PUSH_TIMEOUT_MS = 15_000L
        const val PULL_TIMEOUT_MS = 15_000L
        const val START_LATENCY_SEC = 0.35
        const val MAX_QUEUE = 300
        const val DESKTOP_OFFLINE = "Open Ghosttunes on your PC first."
        const val UNREACHABLE = "Can't reach your PC. Same Wi-Fi?"

        /**
         * Same shape as the desktop's snapshot, queue capped at 300 around the current track.
         * Tracks never carry device-local URLs (non-https artwork falls back to the YouTube thumbnail).
         */
        fun buildSnapshot(queue: List<Track>, index: Int, positionSec: Double, deviceName: String): HandoffSnapshot? {
            if (queue.isEmpty() || index !in queue.indices) return null
            var list = queue
            var i = index
            if (list.size > MAX_QUEUE) {
                val start = (i - MAX_QUEUE / 2).coerceIn(0, list.size - MAX_QUEUE)
                list = list.subList(start, start + MAX_QUEUE)
                i -= start
            }
            val clean = list.map(::sanitize)
            return HandoffSnapshot(clean[i], clean, i, positionSec.coerceAtLeast(0.0), true, deviceName)
        }

        fun sanitize(t: Track): Track {
            val art = t.thumbnail.takeIf { it.startsWith("https://") }
                ?: if (Regex("^[\\w-]{11}$").matches(t.id)) "https://i.ytimg.com/vi/${t.id}/hqdefault.jpg" else ""
            return t.copy(thumbnail = art, artist_thumbnail = t.artist_thumbnail?.takeIf { it.startsWith("https://") })
        }
    }
}
