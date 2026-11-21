package com.ghosttunes.mobile.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.ghosttunes.mobile.data.model.Track
import kotlinx.serialization.Serializable

@Serializable object HomeRoute
@Serializable object SearchRoute
@Serializable object LibraryRoute
@Serializable object SettingsRoute
@Serializable object DebugRoute
@Serializable object LikedRoute
@Serializable object DownloadsRoute
@Serializable object HistoryRoute
@Serializable object ImportRoute
@Serializable data class AlbumRoute(val id: String)
@Serializable data class ArtistRoute(val id: String, val name: String)
@Serializable data class PlaylistRoute(val id: String)
@Serializable data class UserPlaylistRoute(val id: Long)
@Serializable data class GenreRoute(val name: String)

enum class Tab { Home, Search, Library }

/** Things any screen can ask for. Implemented in AppRoot. */
interface AppActions {
    fun play(tracks: List<Track>, index: Int = 0, from: String = "", shuffle: Boolean = false)
    fun trackMenu(track: Track, playlistId: Long? = null)
    fun openArtist(id: String, name: String)
    fun openAlbum(id: String)
    fun openPlaylist(id: String)
    fun openGenre(name: String)
    fun toggleLike(track: Track)
    fun download(tracks: List<Track>)
    fun addToQueue(tracks: List<Track>)
    fun snack(text: String)
    val nav: NavController
}

val LocalActions = compositionLocalOf<AppActions> { error("No AppActions") }

/** Space taken at the bottom by the mini-player + nav bar (+ system nav inset). */
val LocalBottomPadding = compositionLocalOf<Dp> { 0.dp }

val LocalMainVm = compositionLocalOf<MainViewModel> { error("No MainViewModel") }
