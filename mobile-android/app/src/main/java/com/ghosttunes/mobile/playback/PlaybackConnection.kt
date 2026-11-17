package com.ghosttunes.mobile.playback

import android.content.ComponentName
import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.ghosttunes.mobile.data.model.Track
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

data class PlayerState(
    val current: Track? = null,
    val index: Int = 0,
    val queue: List<Track> = emptyList(),
    /** Indices in play order after the current one (respects shuffle). */
    val upNext: List<Int> = emptyList(),
    val isPlaying: Boolean = false,
    val playWhenReady: Boolean = false,
    val isBuffering: Boolean = false,
    val shuffle: Boolean = false,
    val repeatMode: Int = Player.REPEAT_MODE_OFF,
    val error: String? = null,
    val connected: Boolean = false,
)

data class Progress(val positionMs: Long = 0, val durationMs: Long = 0, val bufferedMs: Long = 0) {
    val fraction: Float get() = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
}

/** The UI's handle on PlaybackService. All player calls happen on the main thread. */
@Singleton
class PlaybackConnection @Inject constructor(
    private val context: Context,
    private val json: Json,
    private val scope: CoroutineScope,
) {
    private var future: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null
    private var ticker: Job? = null

    private val _state = MutableStateFlow(PlayerState())
    val state: StateFlow<PlayerState> = _state
    private val _progress = MutableStateFlow(Progress())
    val progress: StateFlow<Progress> = _progress

    /** Connects (starting the service if needed) and returns the controller. */
    suspend fun controller(): MediaController = withContext(Dispatchers.Main.immediate) {
        controller?.let { return@withContext it }
        val f = future ?: MediaController.Builder(
            context, SessionToken(context, ComponentName(context, PlaybackService::class.java)),
        ).buildAsync().also { future = it }
        val c = f.await()
        if (controller == null) {
            controller = c
            c.addListener(listener)
            publish()
        }
        c
    }

    fun connect() { scope.launch(Dispatchers.Main) { runCatching { controller() } } }

    private fun run(block: MediaController.() -> Unit) {
        scope.launch(Dispatchers.Main.immediate) { runCatching { controller().block() } }
    }

    private val listener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) = publish()
    }

    private fun tracksOf(c: Player): List<Track> = (0 until c.mediaItemCount).map { c.getMediaItemAt(it).toTrack(json) }

    private fun publish() {
        val c = controller ?: return
        val queue = if (_state.value.queue.size == c.mediaItemCount && sameIds(c)) _state.value.queue else tracksOf(c)
        val index = c.currentMediaItemIndex.coerceAtLeast(0)
        val upNext = mutableListOf<Int>()
        val timeline = c.currentTimeline
        if (!timeline.isEmpty && index < timeline.windowCount) {
            var i = timeline.getNextWindowIndex(index, Player.REPEAT_MODE_OFF, c.shuffleModeEnabled)
            while (i != C.INDEX_UNSET && upNext.size < 500) {
                upNext += i
                i = timeline.getNextWindowIndex(i, Player.REPEAT_MODE_OFF, c.shuffleModeEnabled)
            }
        }
        val error = c.playerError?.let { describe(it) }
        _state.value = PlayerState(
            current = c.currentMediaItem?.toTrack(json),
            index = index,
            queue = queue,
            upNext = upNext,
            isPlaying = c.isPlaying,
            playWhenReady = c.playWhenReady,
            isBuffering = c.playbackState == Player.STATE_BUFFERING,
            shuffle = c.shuffleModeEnabled,
            repeatMode = c.repeatMode,
            error = error,
            connected = true,
        )
        updateProgress(c)
        if (c.isPlaying && ticker?.isActive != true) {
            ticker = scope.launch(Dispatchers.Main) {
                while (isActive) {
                    controller?.let { updateProgress(it) }
                    delay(250)
                    if (controller?.isPlaying != true) break
                }
            }
        }
    }

    private fun sameIds(c: Player): Boolean {
        val q = _state.value.queue
        for (i in q.indices) if (c.getMediaItemAt(i).mediaId != q[i].id) return false
        return true
    }

    private fun updateProgress(c: Player) {
        val duration = c.duration.takeIf { it != C.TIME_UNSET && it > 0 }
            ?: (_state.value.current?.durationSeconds?.times(1000L) ?: 0L)
        _progress.value = Progress(c.currentPosition.coerceAtLeast(0), duration, c.bufferedPosition)
    }

    private fun describe(e: PlaybackException): String = when (e.errorCode) {
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "Can't reach your PC. Is Ghosttunes open on the same Wi-Fi?"
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "Your PC couldn't stream this song. Try another one."
        else -> "This song couldn't be played."
    }

    // ------------------------------------------------------------------ commands

    fun play(tracks: List<Track>, startIndex: Int = 0, startPositionMs: Long = 0, shuffle: Boolean = false) = run {
        if (tracks.isEmpty()) return@run
        shuffleModeEnabled = shuffle
        setMediaItems(tracks.map { it.toMediaItem(json) }, startIndex.coerceIn(0, tracks.lastIndex), startPositionMs)
        prepare()
        play()
    }

    suspend fun playAndAwait(tracks: List<Track>, startIndex: Int, startPositionMs: Long) = withContext(Dispatchers.Main.immediate) {
        val c = controller()
        c.shuffleModeEnabled = false
        c.setMediaItems(tracks.map { it.toMediaItem(json) }, startIndex.coerceIn(0, tracks.lastIndex), startPositionMs)
        c.prepare()
        c.play()
    }

    fun togglePlay() = run {
        if (playerError != null) { prepare(); play(); return@run }
        if (playbackState == Player.STATE_ENDED) { seekTo(0); play(); return@run }
        if (isPlaying || playWhenReady) pause() else { if (playbackState == Player.STATE_IDLE) prepare(); play() }
    }

    fun retry() = run { prepare(); play() }
    fun seekTo(ms: Long) = run { seekTo(ms.coerceAtLeast(0)) }
    fun next() = run { if (hasNextMediaItem()) seekToNextMediaItem() }
    /** Spotify behaviour: restart the song if more than 3 s in, else go back. */
    fun previous() = run { if (currentPosition > 3_000 || !hasPreviousMediaItem()) seekTo(0) else seekToPreviousMediaItem() }
    fun skipTo(index: Int) = run { if (index in 0 until mediaItemCount) { seekTo(index, 0); play() } }
    fun toggleShuffle() = run { shuffleModeEnabled = !shuffleModeEnabled }
    fun cycleRepeat() = run {
        repeatMode = when (repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun playNext(track: Track) = run {
        val at = if (mediaItemCount == 0) 0 else currentMediaItemIndex + 1
        addMediaItem(at, track.toMediaItem(json))
        if (mediaItemCount == 1) { prepare(); play() }
    }

    fun addToQueue(tracks: List<Track>) = run {
        val wasEmpty = mediaItemCount == 0
        addMediaItems(tracks.map { it.toMediaItem(json) })
        if (wasEmpty) { prepare(); play() }
    }

    fun move(from: Int, to: Int) = run { if (from != to && from in 0 until mediaItemCount && to in 0 until mediaItemCount) moveMediaItem(from, to) }
    fun remove(index: Int) = run { if (index in 0 until mediaItemCount && index != currentMediaItemIndex) removeMediaItem(index) }
    fun clearUpNext() = run { if (currentMediaItemIndex < mediaItemCount - 1) removeMediaItems(currentMediaItemIndex + 1, mediaItemCount) }
}
