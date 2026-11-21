package com.ghosttunes.mobile.playback

import android.net.Uri
import android.os.Looper
import androidx.media3.common.DeviceInfo
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.ghosttunes.mobile.handoff.RemoteState
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * What the notification and lock screen show while this phone controls another device (the PC):
 * that device's song and live progress, with play/pause/next/previous/seek sent to it.
 */
@UnstableApi
class RemotePlayer(private val coordinator: HandoffCoordinator) : SimpleBasePlayer(Looper.getMainLooper()) {

    var remote: RemoteState? = null
        set(value) {
            field = value
            invalidateState()
        }

    override fun getState(): State {
        val r = remote ?: return State.Builder().build()
        val metadata = MediaMetadata.Builder()
            .setTitle(r.track.title)
            .setArtist(listOf(r.track.artist, r.pcName).filter { it.isNotBlank() }.joinToString(" · "))
            .setArtworkUri(ArtworkUrls.sized(r.track.thumbnail, ArtworkUrls.Size.Hero).takeIf { it.isNotBlank() }?.let(Uri::parse))
            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
            .build()
        val item = MediaItem.Builder().setMediaId("remote:${r.track.id}").setMediaMetadata(metadata).build()
        val durationUs = if (r.durationSec > 0) (r.durationSec * 1_000_000).toLong() else androidx.media3.common.C.TIME_UNSET
        val positionMs = (r.positionNow() * 1000).toLong()
        return State.Builder()
            .setAvailableCommands(
                Player.Commands.Builder().addAll(
                    Player.COMMAND_PLAY_PAUSE,
                    Player.COMMAND_STOP,
                    Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
                    Player.COMMAND_SEEK_TO_NEXT,
                    Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                    Player.COMMAND_SEEK_TO_PREVIOUS,
                    Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
                    Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
                    Player.COMMAND_GET_TIMELINE,
                    Player.COMMAND_GET_METADATA,
                ).build(),
            )
            .setPlayWhenReady(r.isPlaying, Player.PLAY_WHEN_READY_CHANGE_REASON_REMOTE)
            .setPlaybackState(Player.STATE_READY)
            .setPlaylist(
                listOf(
                    MediaItemData.Builder(item.mediaId)
                        .setMediaItem(item)
                        .setDurationUs(durationUs)
                        .setIsSeekable(true)
                        .build(),
                ),
            )
            .setCurrentMediaItemIndex(0)
            .setContentPositionMs(PositionSupplier.getExtrapolating(positionMs, if (r.isPlaying) 1f else 0f))
            .setDeviceInfo(DeviceInfo.Builder(DeviceInfo.PLAYBACK_TYPE_REMOTE).build())
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        if (remote?.isPlaying != playWhenReady) coordinator.remoteToggle()
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        when (seekCommand) {
            Player.COMMAND_SEEK_TO_NEXT, Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM -> coordinator.remoteNext()
            Player.COMMAND_SEEK_TO_PREVIOUS, Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM -> coordinator.remotePrevious()
            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM -> if (positionMs >= 0) coordinator.remoteSeek(positionMs / 1000.0)
        }
        return Futures.immediateVoidFuture()
    }

    override fun handleStop(): ListenableFuture<*> = Futures.immediateVoidFuture()
}
