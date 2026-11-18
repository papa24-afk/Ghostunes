package com.ghosttunes.mobile.handoff

import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.ghosttunes.mobile.data.model.CommandRequest
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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
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

/** The phone is controlling the PC (Spotify Connect style). Position is valid at [fetchedAt] (elapsedRealtime). */
data class RemoteState(
    /** Name of the device being controlled (PC model or phone name). */
    val pcName: String,
    val track: Track,
    val isPlaying: Boolean,
    val positionSec: Double,
    val durationSec: Double,
    val fetchedAt: Long,
    val deviceId: String = "pc",
) {
    fun positionNow(): Double {
        val p = if (isPlaying) positionSec + (SystemClock.elapsedRealtime() - fetchedAt) / 1000.0 else positionSec
        return if (durationSec > 0) p.coerceAtMost(durationSec) else p
    }
}

/**
 * Moves playback between this phone and Ghosttunes on the PC (serverHandoff.js protocol).
 * PUSH when the phone is playing, PULL when it isn't. After a push the phone becomes a remote for the PC.
 */
@Singleton
class HandoffCoordinator @Inject constructor(
    private val context: Context,
    private val api: GhosttunesApi,
    private val playback: PlaybackConnection,
    private val scope: CoroutineScope,
    private val locator: com.ghosttunes.mobile.data.net.PcLocator,
    private val direct: com.ghosttunes.mobile.data.direct.DirectSource,
    private val settings: com.ghosttunes.mobile.data.prefs.SettingsRepository,
    private val link: dagger.Lazy<PcLink>,
    private val beacon: ProximityBeacon,
) {
    private val _devices = MutableStateFlow<List<com.ghosttunes.mobile.data.model.Device>>(emptyList())
    /** Other devices (the PC and other phones), refreshed while the app is on screen. */
    val devices: StateFlow<List<com.ghosttunes.mobile.data.model.Device>> = _devices
    private var watchJob: Job? = null

    /** One-shot events that drive the transfer animation. */
    sealed interface Transfer {
        val track: Track
        data class ToPc(override val track: Track) : Transfer
        data class ToPhone(override val track: Track) : Transfer
    }
    private val _transfers = MutableSharedFlow<Transfer>(extraBufferCapacity = 4)
    val transfers: SharedFlow<Transfer> = _transfers

    private val _status = MutableStateFlow<HandoffStatus?>(null)
    /** Only failures are shown to the user; success is the animation. */
    val status: StateFlow<HandoffStatus?> = _status

    private val _remote = MutableStateFlow<RemoteState?>(null)
    val remote: StateFlow<RemoteState?> = _remote

    private var lastTriggerAt = 0L
    private var job: Job? = null
    private var clearJob: Job? = null
    private var remoteJob: Job? = null
    private var pcName: String = "your PC"
    private var warmedId: String? = null

    init {
        // Playing something on the phone ends remote mode.
        scope.launch {
            playback.state.collect { s -> if (s.isPlaying && _remote.value != null && job?.isActive != true) stopRemote() }
        }
    }

    /** This phone's name as set in its settings ("Galaxy S21"), else its model. */
    val deviceName: String get() = link.get().phoneName

    /** Debounced (NFC can fire twice; flick + button within 2 s count once). */
    fun trigger(source: String): Boolean {
        val now = SystemClock.elapsedRealtime()
        if (now - lastTriggerAt < DEBOUNCE_MS || job?.isActive == true) return false
        lastTriggerAt = now
        Log.i(TAG, "trigger from $source")
        quiet = source == "near"
        job = scope.launch { run() }
        return true
    }

    /** Proximity triggers fail silently (walking past the PC shouldn't pop up errors). */
    private var quiet = false

    private fun show(status: HandoffStatus?) {
        if (quiet && status is HandoffStatus.Failed) return
        clearJob?.cancel()
        _status.value = status
        if (status?.terminal == true) {
            clearJob = scope.launch { delay(3_200); if (_status.value === status) _status.value = null }
        }
    }

    private suspend fun run() {
        try {
            // Already connected (Wi-Fi or Bluetooth)? Go straight away. Else a quick look for the PC
            // (max 4 s, so a shake is never stuck for long); a full search carries on in the background
            // and the next shake works as soon as it finds the PC.
            if (link.get().via.value == null) {
                val found = withTimeoutOrNull(4_000) { locator.ensure(allowScan = false) }
                if (found == null) {
                    scope.launch { runCatching { locator.ensure(allowScan = true) } }
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
        val controller = playback.controller()
        val state = playback.state.value
        val (index, positionSec) = withContext(Dispatchers.Main) {
            controller.currentMediaItemIndex to controller.currentPosition / 1000.0
        }
        val snapshot = buildSnapshot(state.queue, index, positionSec, deviceName) ?: return

        // Hard limits on every call: a stale connection fails in seconds, never hangs a shake.
        val response = withTimeoutOrNull(CALL_TIMEOUT_MS) { withContext(Dispatchers.IO) { api.push(PushRequest(snapshot)) } }
            ?: run { reconnectSoon(); show(HandoffStatus.Failed(UNREACHABLE)); return }
        if (response.code() == 409) {
            show(HandoffStatus.Failed(DESKTOP_OFFLINE))
            return
        }
        val id = response.body()?.id
        if (!response.isSuccessful || id == null) {
            show(HandoffStatus.Failed(UNREACHABLE))
            return
        }
        // The PC has it: throw the art now (the phone keeps playing until the PC is audible).
        _transfers.tryEmit(Transfer.ToPc(snapshot.track))
        context.vibrate(20)

        val result = withTimeoutOrNull(PUSH_TIMEOUT_MS) {
            while (true) {
                delay(150)
                val s = withTimeoutOrNull(2_500) { runCatching { withContext(Dispatchers.IO) { api.handoffStatus(id) } }.getOrNull() } ?: continue
                if (s.status == "playing" || s.status == "failed") return@withTimeoutOrNull s
            }
            @Suppress("UNREACHABLE_CODE") null
        }
        when (result?.status) {
            "playing" -> {
                withContext(Dispatchers.Main) { fadeOutAndPause(controller, 450) }
                _status.value = HandoffStatus.Done("")
                startRemote(snapshot.track, snapshot.position)
            }
            "failed" -> show(HandoffStatus.Failed("Your PC couldn't play this song."))
            else -> {
                withTimeoutOrNull(CALL_TIMEOUT_MS) { runCatching { withContext(Dispatchers.IO) { api.release(ReleaseRequest("timeout")) } } }
                show(HandoffStatus.Failed("Your PC didn't start in time."))
            }
        }
    }

    // ------------------------------------------------------------------ PULL

    private suspend fun pull() {
        val desktop: DesktopState = withTimeoutOrNull(CALL_TIMEOUT_MS) { withContext(Dispatchers.IO) { api.desktop() } }
            ?: run { reconnectSoon(); show(HandoffStatus.Failed(UNREACHABLE)); return }
        val receivedAt = SystemClock.elapsedRealtime()
        if (desktop.name.isNotBlank()) pcName = desktop.name
        if (!desktop.online) {
            show(HandoffStatus.Failed(DESKTOP_OFFLINE))
            return
        }
        val np = desktop.nowPlaying
        if (np == null || !np.isPlaying) {
            show(HandoffStatus.Failed("Nothing is playing on your PC."))
            return
        }
        stopRemote()
        val queue = np.queue.ifEmpty { listOf(np.track) }
        val index = queue.indexOfFirst { it.id == np.track.id }.takeIf { it >= 0 } ?: 0
        fun target() = np.position + (SystemClock.elapsedRealtime() - receivedAt) / 1000.0
        val controller = playback.controller()
        _transfers.tryEmit(Transfer.ToPhone(np.track))
        com.ghosttunes.mobile.playback.StreamHints.preferPc += np.track.id
        playback.playAndAwait(queue, index, ((target() + START_LATENCY_SEC) * 1000).toLong())

        // Wait until ExoPlayer is actually playing this track, then land on the exact second.
        val started = withTimeoutOrNull(PULL_TIMEOUT_MS) {
            while (true) {
                val ok = withContext(Dispatchers.Main) { controller.isPlaying && controller.currentMediaItem?.mediaId == np.track.id }
                if (ok) return@withTimeoutOrNull true
                delay(80)
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
        withTimeoutOrNull(CALL_TIMEOUT_MS) { runCatching { withContext(Dispatchers.IO) { api.release(ReleaseRequest("pulled")) } } }
        context.vibrate(20)
        _status.value = HandoffStatus.Done("")
    }

    // ------------------------------------------------------------------ remote (phone controls the PC)

    private fun startRemote(track: Track, position: Double, deviceId: String = "pc", name: String = pcName, playing: Boolean = true) {
        _remote.value = RemoteState(name, track, playing, position, track.durationSeconds.toDouble(), SystemClock.elapsedRealtime(), deviceId)
        remoteJob?.cancel()
        remoteJob = scope.launch {
            var misses = 0
            while (isActive) {
                val list = runCatching { withContext(Dispatchers.IO) { api.devices().devices } }.getOrNull()
                val at = SystemClock.elapsedRealtime()
                val d = list?.firstOrNull { it.id == deviceId }
                if (list != null) _devices.value = list.filter { it.id != beacon.id }
                if (d == null || !d.online) {
                    if (++misses >= 5) { _remote.value = null; break }
                } else {
                    misses = 0
                    if (d.id == "pc" && d.name.isNotBlank()) pcName = d.name
                    val np = d.nowPlaying
                    // Have the song ready on this phone too, so taking it back is instant.
                    if (np != null && np.track.id != warmedId) {
                        warmedId = np.track.id
                        launch(Dispatchers.IO) { runCatching { direct.stream(np.track.id, settings.current.lowQualityStreaming) } }
                    }
                    if (np != null && _remote.value != null) {
                        _remote.value = RemoteState(d.name.ifBlank { name }, np.track, np.isPlaying, np.position, np.track.durationSeconds.toDouble(), at, deviceId)
                    }
                }
                delay(1_000)
            }
        }
    }

    fun stopRemote() {
        remoteJob?.cancel()
        remoteJob = null
        _remote.value = null
    }

    private fun command(action: String, position: Double? = null) {
        scope.launch {
            val target = _remote.value?.deviceId ?: "pc"
            runCatching { withContext(Dispatchers.IO) { api.deviceCommand(target, CommandRequest(action, position)) } }
                .onFailure { show(HandoffStatus.Failed(UNREACHABLE)) }
        }
    }

    fun remoteToggle() {
        val r = _remote.value ?: return
        _remote.value = r.copy(isPlaying = !r.isPlaying, positionSec = r.positionNow(), fetchedAt = SystemClock.elapsedRealtime())
        command(if (r.isPlaying) "pause" else "play")
    }

    fun remoteNext() = command("next")
    fun remotePrevious() = command("previous")

    fun remoteSeek(sec: Double) {
        _remote.value = _remote.value?.copy(positionSec = sec, fetchedAt = SystemClock.elapsedRealtime())
        command("seek", sec)
    }

    /** "This phone" in the device picker: continue the controlled device's song here. */
    fun continueOnPhone() {
        if (job?.isActive == true) return
        lastTriggerAt = SystemClock.elapsedRealtime()
        val target = _remote.value?.deviceId ?: "pc"
        job = scope.launch {
            try {
                if (target == "pc") pull() else takeOverFromPhone(target)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                show(HandoffStatus.Failed(UNREACHABLE))
            }
        }
    }

    // ------------------------------------------------------------------ Connect: any device

    /** Refresh the device list every 3 s while the app is on screen; pick up music playing elsewhere. */
    fun watchDevices(on: Boolean) {
        watchJob?.cancel()
        if (!on) return
        watchJob = scope.launch {
            while (isActive) {
                val list = runCatching { withContext(Dispatchers.IO) { api.devices().devices } }.getOrNull()
                if (list != null) {
                    val others = list.filter { it.id != beacon.id && it.online }
                    _devices.value = others
                    if (_remote.value == null && !playback.state.value.isPlaying && job?.isActive != true) {
                        // Nothing playing here but something elsewhere: show it with working controls.
                        others.firstOrNull { it.nowPlaying?.isPlaying == true }?.let { d ->
                            val np = d.nowPlaying!!
                            startRemote(np.track, np.position, d.id, d.name, playing = true)
                        }
                    }
                }
                delay(3_000)
            }
        }
    }

    /** Device picker: send music there if this phone is playing; otherwise control what it's playing. */
    fun selectDevice(device: com.ghosttunes.mobile.data.model.Device) {
        if (job?.isActive == true) return
        lastTriggerAt = SystemClock.elapsedRealtime()
        quiet = false
        job = scope.launch {
            try {
                val playingHere = playback.state.value.isPlaying
                val np = device.nowPlaying
                when {
                    playingHere && device.id == "pc" -> push()
                    playingHere -> sendToPhone(device)
                    np != null -> startRemote(np.track, np.position, device.id, device.name, np.isPlaying)
                    else -> show(HandoffStatus.Failed("Nothing is playing on ${device.name}."))
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                show(HandoffStatus.Failed(UNREACHABLE))
            }
        }
    }

    private suspend fun sendToPhone(device: com.ghosttunes.mobile.data.model.Device) {
        val controller = playback.controller()
        val state = playback.state.value
        val (index, positionSec) = withContext(Dispatchers.Main) { controller.currentMediaItemIndex to controller.currentPosition / 1000.0 }
        val snapshot = buildSnapshot(state.queue, index, positionSec, deviceName) ?: return
        val r = withTimeoutOrNull(CALL_TIMEOUT_MS) { withContext(Dispatchers.IO) { api.devicePlay(device.id, PushRequest(snapshot)) } }
            ?: run { show(HandoffStatus.Failed("${device.name} isn't reachable.")); return }
        if (!r.isSuccessful) { show(HandoffStatus.Failed("${device.name} isn't reachable.")); return }
        _transfers.tryEmit(Transfer.ToPc(snapshot.track))
        context.vibrate(20)
        // Wait until that phone reports it's playing, then fade out here.
        val started = withTimeoutOrNull(12_000) {
            while (true) {
                delay(300)
                val d = runCatching { withContext(Dispatchers.IO) { api.devices().devices } }.getOrNull()?.firstOrNull { it.id == device.id }
                val dnp = d?.nowPlaying
                if (dnp != null && dnp.isPlaying && dnp.track.id == snapshot.track.id) return@withTimeoutOrNull true
            }
            @Suppress("UNREACHABLE_CODE") false
        } ?: false
        if (started) {
            withContext(Dispatchers.Main) { fadeOutAndPause(controller, 450) }
            startRemote(snapshot.track, snapshot.position, device.id, device.name)
        } else {
            show(HandoffStatus.Failed("${device.name} didn't start in time."))
        }
    }

    private suspend fun takeOverFromPhone(id: String) {
        val d = withContext(Dispatchers.IO) { api.devices().devices }.firstOrNull { it.id == id } ?: return
        val np = d.nowPlaying ?: run { show(HandoffStatus.Failed("Nothing is playing on ${d.name}.")); return }
        stopRemote()
        val queue = np.queue.ifEmpty { listOf(np.track) }
        val index = queue.indexOfFirst { it.id == np.track.id }.coerceAtLeast(0)
        _transfers.tryEmit(Transfer.ToPhone(np.track))
        playback.playAndAwait(queue, index, ((np.position + START_LATENCY_SEC) * 1000).toLong())
        runCatching { withContext(Dispatchers.IO) { api.deviceCommand(id, CommandRequest("pause")) } }
        context.vibrate(20)
    }

    /** A request timed out: the saved PC address may be stale, so look for the PC again in the background. */
    private fun reconnectSoon() {
        scope.launch { runCatching { locator.ensure(allowScan = true) } }
    }

    /** Music arrived from another device: play the "drops in" animation. */
    fun announceArrival(track: Track) {
        _transfers.tryEmit(Transfer.ToPhone(track))
        context.vibrate(20)
    }

    companion object {
        private const val TAG = "GhosttunesHandoff"
        const val DEBOUNCE_MS = 2_000L
        const val PUSH_TIMEOUT_MS = 15_000L
        /** Longest any single transfer request may take. */
        const val CALL_TIMEOUT_MS = 4_000L
        const val PULL_TIMEOUT_MS = 15_000L
        const val START_LATENCY_SEC = 0.35
        const val MAX_QUEUE = 300
        const val DESKTOP_OFFLINE = "Open Ghosttunes on your PC first."
        const val UNREACHABLE = "Can't reach your PC. Same Wi-Fi?"

        /**
         * Same shape as the desktop's snapshot, queue capped at 300 around the current track.
         * Tracks never carry device-local URLs (non-https artwork falls back to the video thumbnail).
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
