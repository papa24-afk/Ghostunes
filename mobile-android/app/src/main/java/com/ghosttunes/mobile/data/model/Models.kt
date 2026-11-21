package com.ghosttunes.mobile.data.model

import kotlinx.serialization.Serializable

/** Same shape as the desktop app's Track (src/types.ts). Never carries device-local URLs. */
@Serializable
data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val album: String = "",
    val duration: String = "",
    val durationSeconds: Int = 0,
    val thumbnail: String = "",
    val artistId: String? = null,
    val artist_thumbnail: String? = null,
    val source: String? = null,
)

@Serializable
data class TracksResponse(val tracks: List<Track> = emptyList())

@Serializable
data class SearchResponse(val results: List<Track> = emptyList())

@Serializable
data class Health(val status: String = "", val uptime: Double = 0.0, val timestamp: Long = 0)

@Serializable
data class Suggestions(
    val suggestions: List<String> = emptyList(),
    val recommended: List<SuggestionItem> = emptyList(),
)

@Serializable
data class SuggestionItem(
    val id: String = "",
    val videoId: String = "",
    val browseId: String = "",
    val title: String = "",
    val artist: String = "",
    val type: String = "track",
    val subtitle: String = "",
    val thumbnail: String = "",
)

@Serializable
data class ArtistRef(
    val id: String = "",
    val name: String = "",
    val avatar: String = "",
    val subtitle: String = "",
)

@Serializable
data class AlbumRef(
    val id: String,
    val title: String = "",
    val artist: String = "",
    val year: String = "",
    val type: String = "album",
    val thumbnail: String = "",
)

@Serializable
data class PlaylistRef(
    val id: String,
    val title: String = "",
    val author: String = "",
    val itemCount: String = "",
    val thumbnail: String = "",
)

@Serializable
data class TopResult(val type: String, val item: kotlinx.serialization.json.JsonObject)

@Serializable
data class SearchAll(
    val query: String = "",
    val top: TopResult? = null,
    val songs: List<Track> = emptyList(),
    val artists: List<ArtistRef> = emptyList(),
    val albums: List<AlbumRef> = emptyList(),
    val playlists: List<PlaylistRef> = emptyList(),
)

@Serializable
data class ArtistPage(
    val id: String = "",
    val name: String = "",
    val avatar: String = "",
    val banner: String = "",
    val description: String = "",
    val subscribers: String = "",
    val topTracks: List<Track> = emptyList(),
    val albums: List<AlbumRef> = emptyList(),
    val singles: List<AlbumRef> = emptyList(),
    val similarArtists: List<ArtistRef> = emptyList(),
)

@Serializable
data class AlbumPage(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    val year: String = "",
    val description: String = "",
    val thumbnail: String = "",
    val durationText: String = "",
    val trackCount: Int = 0,
    val tracks: List<Track> = emptyList(),
)

@Serializable
data class PlaylistPage(
    val id: String = "",
    val title: String = "",
    val author: String = "",
    val description: String = "",
    val subtitle: String = "",
    val thumbnail: String = "",
    val trackCount: Int = 0,
    val tracks: List<Track> = emptyList(),
)

@Serializable
data class Lyrics(
    val syncedLyrics: String? = null,
    val plainLyrics: String? = null,
    val instrumental: Boolean = false,
    val source: String? = null,
)

@Serializable
data class SmartRadio(val mode: String = "", val tracks: List<Track> = emptyList())

@Serializable
data class AvatarResponse(val avatar: String? = null)

@Serializable
data class PrepareResponse(val ok: Boolean = false, val tookMs: Long = 0)

@Serializable
data class Feedback(
    val track_id: String,
    val title: String,
    val artist: String,
    val action: String,
    val duration_played: Int,
    val total_duration: Int,
)

// ---- handoff (serverHandoff.js) ----

@Serializable
data class HandoffSnapshot(
    val track: Track,
    val queue: List<Track>,
    val queueIndex: Int,
    val position: Double,
    val isPlaying: Boolean,
    val deviceName: String? = null,
)

@Serializable
data class PushRequest(val snapshot: HandoffSnapshot)

@Serializable
data class PushResponse(val id: String, val stampedAt: Long = 0)

@Serializable
data class HandoffStatusResponse(val id: String = "", val status: String = "pending", val error: String? = null)

@Serializable
data class DesktopState(val online: Boolean = false, val nowPlaying: HandoffSnapshot? = null, val serverTime: Long = 0, val name: String = "")

@Serializable
data class CommandRequest(val action: String, val position: Double? = null)

/** A device in the Connect list: the PC ("pc") or a phone. */
@Serializable
data class Device(
    val id: String,
    val type: String = "phone",
    val name: String = "",
    val output: String? = null,
    val online: Boolean = false,
    val via: String? = null,
    val nowPlaying: HandoffSnapshot? = null,
)

@Serializable
data class DevicesResponse(val devices: List<Device> = emptyList(), val serverTime: Long = 0)

@Serializable
data class DeviceStateRequest(val id: String, val name: String, val nowPlaying: HandoffSnapshot? = null, val output: String? = null)

@Serializable
data class ReleaseRequest(val reason: String)
