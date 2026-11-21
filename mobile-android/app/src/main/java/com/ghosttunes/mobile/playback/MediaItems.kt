package com.ghosttunes.mobile.playback

import android.content.Context
import android.net.Uri
import androidx.core.os.bundleOf
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.download.DownloadFiles
import kotlinx.serialization.json.Json

private const val EXTRA_TRACK = "gt_track"

/** Uri the player resolves at load time to a downloaded file or the PC's stream. */
fun trackUri(id: String): Uri = Uri.parse("ghosttunes://track/$id")

fun Track.toMediaItem(json: Json, context: Context? = null): MediaItem {
    val localArt = context?.let { DownloadFiles.localArt(it, id) }
    val artwork = localArt?.let { Uri.fromFile(it) }
        ?: ArtworkUrls.sized(thumbnail, ArtworkUrls.Size.Hero).takeIf { it.isNotBlank() }?.let(Uri::parse)
    val metadata = MediaMetadata.Builder()
        .setTitle(title)
        .setArtist(artist)
        .setAlbumTitle(album.ifBlank { null })
        .setArtworkUri(artwork)
        .setIsPlayable(true)
        .setIsBrowsable(false)
        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
        .setExtras(bundleOf(EXTRA_TRACK to json.encodeToString(Track.serializer(), this)))
        .apply { if (durationSeconds > 0) setDurationMs(durationSeconds * 1000L) }
        .build()
    return MediaItem.Builder()
        .setMediaId(id)
        .setUri(trackUri(id))
        .setMediaMetadata(metadata)
        .build()
}

fun MediaItem.toTrack(json: Json): Track {
    mediaMetadata.extras?.getString(EXTRA_TRACK)?.let { s ->
        runCatching { return json.decodeFromString(Track.serializer(), s) }
    }
    return Track(
        id = mediaId,
        title = mediaMetadata.title?.toString() ?: "Unknown Title",
        artist = mediaMetadata.artist?.toString() ?: "Unknown Artist",
        album = mediaMetadata.albumTitle?.toString() ?: "",
        thumbnail = mediaMetadata.artworkUri?.takeIf { it.scheme == "https" }?.toString() ?: "",
    )
}

/** Items coming from a controller lose their uri; give it back (and refresh local artwork). */
fun MediaItem.resolved(json: Json, context: Context): MediaItem = toTrack(json).toMediaItem(json, context)
