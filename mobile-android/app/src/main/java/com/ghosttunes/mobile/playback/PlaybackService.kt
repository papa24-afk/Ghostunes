package com.ghosttunes.mobile.playback

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.PowerManager
import androidx.annotation.OptIn
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.ghosttunes.mobile.MainActivity
import com.ghosttunes.mobile.R
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.handoff.FlickMonitor
import com.ghosttunes.mobile.handoff.FlickSensor
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject

@OptIn(UnstableApi::class)
@AndroidEntryPoint
class PlaybackService : MediaSessionService() {
    @Inject lateinit var playerFactory: PlayerFactory
    @Inject lateinit var queueStore: QueueStore
    @Inject lateinit var library: LibraryRepository
    @Inject lateinit var music: MusicRepository
    @Inject lateinit var settings: SettingsRepository
    @Inject lateinit var sleepTimer: SleepTimer
    @Inject lateinit var handoff: HandoffCoordinator
    @Inject lateinit var flickMonitor: FlickMonitor
    @Inject lateinit var json: Json
    @Inject lateinit var direct: com.ghosttunes.mobile.data.direct.DirectSource
    @Inject lateinit var locator: com.ghosttunes.mobile.data.net.PcLocator
    @Inject lateinit var beacon: com.ghosttunes.mobile.handoff.ProximityBeacon
    @Inject lateinit var api: com.ghosttunes.mobile.data.net.GhosttunesApi
    private var retriedId: String? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var player: ExoPlayer
    private var session: MediaSession? = null
    /** Shown in the notification / lock screen while this phone controls another device. */
    private var remoteSession: MediaSession? = null
    private var remotePlayer: RemotePlayer? = null
    private lateinit var openApp: PendingIntent
    private var restoredQueue = false
    private var radioJob: Job? = null
    private var sleepJob: Job? = null
    private var flickSensor: FlickSensor? = null
    private var screenOn = true

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            screenOn = intent.action != Intent.ACTION_SCREEN_OFF
            updateBackgroundFlick()
        }
    }

    override fun onCreate() {
        super.onCreate()
        player = playerFactory.create()
        player.addListener(listener)

        openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_PLAYER, true)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(openApp)
            .setCallback(SessionCallback())
            .build()

        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this).build().apply { setSmallIcon(R.drawable.ic_stat_ghost) }
        )

        // Restore the last queue (paused) so the mini-player and notification resume where we left off.
        scope.launch {
            if (player.mediaItemCount == 0) {
                queueStore.load()?.let { saved ->
                    player.setMediaItems(saved.tracks.map { it.toMediaItem(json, this@PlaybackService) }, saved.index, saved.positionMs)
                    player.prepare()
                    player.playWhenReady = false
                }
            }
            restoredQueue = true
        }

        // Persist position every 5 s while playing.
        scope.launch {
            while (isActive) {
                delay(5_000)
                if (player.isPlaying) saveQueue()
            }
        }

        scope.launch { sleepTimer.state.collectLatest { applySleepTimer(it) } }

        screenOn = getSystemService(PowerManager::class.java).isInteractive
        ContextCompat.registerReceiver(
            this, screenReceiver,
            IntentFilter().apply { addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF) },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        scope.launch {
            settings.settings.map { listOf(it.flickEnabled, it.flickInBackground, it.flickSensitivity, it.bringClose) }
                .distinctUntilChanged()
                .collect { updateBackgroundFlick() }
        }
        // While this phone is controlling another device, keep listening so a shake takes the music back.
        scope.launch { handoff.remote.map { it != null }.distinctUntilChanged().collect { updateBackgroundFlick() } }
        // ...and the notification / lock screen show and control that device instead of this phone.
        scope.launch { handoff.remote.collect { showRemote(it) } }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Keep playing when swiped from recents; stop only if nothing is playing.
        if (!player.playWhenReady || player.mediaItemCount == 0) {
            saveQueue()
            stopSelf()
        }
    }

    override fun onDestroy() {
        saveQueue()
        flickSensor?.stop()
        beacon.hold("playing", false)
        runCatching { unregisterReceiver(screenReceiver) }
        remoteSession?.let { removeSession(it); it.release() }
        remoteSession = null
        session?.run {
            player.release()
            release()
        }
        session = null
        scope.cancel()
        super.onDestroy()
    }

    // ------------------------------------------------------------------ queue helpers

    private fun queueTracks(): List<Track> = (0 until player.mediaItemCount).map { player.getMediaItemAt(it).toTrack(json) }

    private fun saveQueue() {
        if (!restoredQueue || player.mediaItemCount == 0) return
        val tracks = queueTracks()
        val index = player.currentMediaItemIndex
        val position = player.currentPosition
        scope.launch(Dispatchers.IO) { queueStore.save(tracks, index, position) }
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            val track = mediaItem?.toTrack(json) ?: return
            if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED || player.playWhenReady) {
                scope.launch(Dispatchers.IO) { library.recordPlay(track) }
            }
            if (sleepTimer.state.value == SleepTimerState.EndOfTrack && reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                // handled by pauseAtEndOfMediaItems
            }
            prefetchNext()
            maybeExtendWithRadio()
            saveQueue()
            warmOnPc(track.id)
        }

        override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
            val oldItem = old.mediaItem ?: return
            if (old.mediaItemIndex == new.mediaItemIndex) return
            val track = oldItem.toTrack(json)
            val playedSec = (old.positionMs / 1000).toInt()
            val total = track.durationSeconds.takeIf { it > 0 } ?: (player.duration / 1000).toInt()
            val action = when {
                reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION -> "complete"
                playedSec < 30 -> "skip"
                else -> null
            } ?: return
            scope.launch { music.feedback(track, action, playedSec, total) }
        }

        override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) {
            if (reason == Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED) {
                saveQueue()
                prefetchNext()
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (!isPlaying) saveQueue()
            updateBackgroundFlick()
        }

        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            // YouTube stream links expire after a few hours (HTTP 403): drop the cached link and retry once.
            val id = player.currentMediaItem?.mediaId ?: return
            val http = (error.cause as? androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException)?.responseCode
            if ((http == 403 || http == 410) && retriedId != id) {
                retriedId = id
                direct.invalidate(id)
                val pos = player.currentPosition
                player.prepare()
                player.seekTo(pos)
                player.play()
            }
        }

        override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
            if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_END_OF_MEDIA_ITEM && sleepTimer.state.value == SleepTimerState.EndOfTrack) {
                player.pauseAtEndOfMediaItems = false
                sleepTimer.cancel()
            }
        }
    }

    /** Warm the PC's stream info for the next track (~10 s on a cold song) so the transition is instant. */
    private fun prefetchNext() {
        val next = player.nextMediaItemIndex
        if (next == androidx.media3.common.C.INDEX_UNSET) return
        val id = player.getMediaItemAt(next).mediaId
        if (com.ghosttunes.mobile.download.DownloadFiles.localAudio(this, id) != null) return
        scope.launch { music.prepare(id) }
    }

    /**
     * Have the PC get this song ready too, so a flick starts it there almost instantly.
     * Only while the PC has been reachable recently; fire-and-forget.
     */
    private fun warmOnPc(id: String) {
        scope.launch(Dispatchers.IO) {
            val fresh = android.os.SystemClock.elapsedRealtime() - locator.lastOkAt < 10 * 60_000L
            if (!fresh && runCatching { locator.ensure(allowScan = false) }.getOrNull() == null) return@launch
            runCatching { api.warmOnPc(id) }
        }
    }

    /** Smart radio: when we're on the last track, append recommendations so music never stops. */
    private fun maybeExtendWithRadio() {
        if (!settings.current.autoplay || player.repeatMode != Player.REPEAT_MODE_OFF) return
        if (player.mediaItemCount == 0 || player.currentMediaItemIndex < player.mediaItemCount - 1) return
        if (radioJob?.isActive == true) return
        val seed = player.currentMediaItem?.toTrack(json) ?: return
        radioJob = scope.launch {
            val existing = queueTracks().map { it.id }.toSet()
            music.radio(seed).onSuccess { tracks ->
                val fresh = tracks.filter { it.id !in existing }.take(20)
                if (fresh.isNotEmpty()) player.addMediaItems(fresh.map { it.toMediaItem(json, this@PlaybackService) })
            }
        }
    }

    private fun applySleepTimer(state: SleepTimerState) {
        sleepJob?.cancel()
        player.pauseAtEndOfMediaItems = state == SleepTimerState.EndOfTrack
        if (state is SleepTimerState.At) {
            sleepJob = scope.launch {
                val wait = state.endsAtElapsed - android.os.SystemClock.elapsedRealtime()
                if (wait > 0) delay(wait)
                fadeOutAndPause(player, 3_000)
                sleepTimer.cancel()
            }
        }
    }

    // ------------------------------------------------------------------ remote notification

    @androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
    private fun showRemote(state: com.ghosttunes.mobile.handoff.RemoteState?) {
        if (state != null) {
            val rp = remotePlayer ?: RemotePlayer(handoff).also { remotePlayer = it }
            rp.remote = state
            if (remoteSession == null) {
                // Hide this phone's paused card so only the device being controlled shows.
                if (!player.isPlaying && player.playbackState != Player.STATE_IDLE) player.stop()
                remoteSession = MediaSession.Builder(this, rp)
                    .setId("remote")
                    .setSessionActivity(openApp)
                    .build()
                    .also { addSession(it) }
            }
        } else if (remoteSession != null) {
            remoteSession?.let { removeSession(it); it.release() }
            remoteSession = null
            remotePlayer?.remote = null
            // Bring this phone's queue back (paused) so it can carry on here.
            if (player.playbackState == Player.STATE_IDLE && player.mediaItemCount > 0) player.prepare()
        }
    }

    // ------------------------------------------------------------------ background flick

    private fun updateBackgroundFlick() {
        val s = settings.current
        beacon.hold("playing", s.bringClose && player.isPlaying && screenOn)
        val shouldRun = s.flickEnabled && s.flickInBackground && (player.isPlaying || handoff.remote.value != null) && screenOn
        if (shouldRun) {
            val sensor = flickSensor ?: FlickSensor(this, flickMonitor) { handoff.trigger("flick") }.also { flickSensor = it }
            sensor.start(s.flickSensitivity)
        } else {
            flickSensor?.stop()
        }
    }

    // ------------------------------------------------------------------ session callback

    private inner class SessionCallback : MediaSession.Callback {
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> =
            Futures.immediateFuture(mediaItems.map { it.resolved(json, this@PlaybackService) }.toMutableList())

        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = scope.future {
            val saved = queueStore.load()
            if (saved == null) {
                MediaSession.MediaItemsWithStartPosition(emptyList(), 0, 0)
            } else {
                MediaSession.MediaItemsWithStartPosition(
                    saved.tracks.map { it.toMediaItem(json, this@PlaybackService) }, saved.index, saved.positionMs,
                )
            }
        }
    }
}

/** Ramps volume down, pauses, restores volume. */
suspend fun fadeOutAndPause(player: Player, durationMs: Long = 900) {
    if (!player.isPlaying) return
    val start = player.volume
    val steps = (durationMs / 30).coerceAtLeast(1)
    for (i in 1..steps) {
        player.volume = start * (1f - i.toFloat() / steps)
        delay(30)
    }
    player.pause()
    player.volume = start
}
