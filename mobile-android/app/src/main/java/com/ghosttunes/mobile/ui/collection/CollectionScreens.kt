package com.ghosttunes.mobile.ui.collection

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.History
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.common.MenuItem
import com.ghosttunes.mobile.ui.common.NameDialog
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.player.GtSheet
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RemoteCollection(
    val header: CollectionHeader? = null,
    val tracks: List<Track> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
    val artistId: String? = null,
    val artistName: String? = null,
)

@HiltViewModel
class CollectionViewModel @Inject constructor(
    private val music: MusicRepository,
    val library: LibraryRepository,
    val downloads: DownloadRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(RemoteCollection())
    val state: StateFlow<RemoteCollection> = _state
    private var lastLoad: (() -> Unit)? = null

    fun retry() = lastLoad?.invoke()

    fun album(id: String) {
        lastLoad = { album(id) }
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            music.album(id).onSuccess { a ->
                val meta = listOf(if (a.trackCount == 1) "Single" else "Album", a.year, a.durationText.substringAfter("• ").ifBlank { null })
                    .filterNotNull().filter { it.isNotBlank() }.joinToString(" · ")
                _state.value = RemoteCollection(
                    header = CollectionHeader(a.title, a.artist, meta, ArtworkUrls.sized(a.thumbnail, ArtworkUrls.Size.Hero)),
                    tracks = a.tracks, loading = false, artistName = a.artist,
                )
            }.onFailure { _state.value = RemoteCollection(loading = false, error = it.message) }
        }
    }

    fun playlist(id: String) {
        lastLoad = { playlist(id) }
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            music.playlist(id).onSuccess { p ->
                val meta = listOf("Playlist", "${p.trackCount} songs", p.subtitle.substringAfterLast("• ").takeIf { it.contains("min") || it.contains("hour") })
                    .filterNotNull().joinToString(" · ")
                _state.value = RemoteCollection(
                    header = CollectionHeader(p.title, p.author, meta, ArtworkUrls.sized(p.thumbnail.ifBlank { p.tracks.firstOrNull()?.thumbnail }, ArtworkUrls.Size.Hero)),
                    tracks = p.tracks, loading = false,
                )
            }.onFailure { _state.value = RemoteCollection(loading = false, error = it.message) }
        }
    }

    fun genre(name: String) {
        lastLoad = { genre(name) }
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            music.genre(name).onSuccess { tracks ->
                _state.value = RemoteCollection(
                    header = CollectionHeader(name, "", "${tracks.size} songs", tracks.firstOrNull()?.let { ArtworkUrls.sized(it.thumbnail, ArtworkUrls.Size.Hero) }),
                    tracks = tracks, loading = false,
                )
            }.onFailure { _state.value = RemoteCollection(loading = false, error = it.message) }
        }
    }

    fun rename(id: Long, name: String) = viewModelScope.launch { library.renamePlaylist(id, name) }
    fun delete(id: Long) = viewModelScope.launch { library.deletePlaylist(id) }
    fun clearHistory() = viewModelScope.launch { library.clearHistory() }
    fun removeAllDownloads() = viewModelScope.launch { downloads.removeAll() }
}

@Composable
fun AlbumScreen(id: String, vm: CollectionViewModel = hiltViewModel()) {
    LaunchedEffect(id) { vm.album(id) }
    val s by vm.state.collectAsState()
    val actions = LocalActions.current
    val header = s.header?.copy(onSubtitleClick = s.artistName?.let { n -> { actions.openArtist("", n.substringBefore(",").trim()) } })
    CollectionScaffold(header, s.tracks, s.loading, s.error, vm::retry, from = s.header?.title.orEmpty(), numbered = true, showArt = false)
}

@Composable
fun PlaylistScreen(id: String, vm: CollectionViewModel = hiltViewModel()) {
    LaunchedEffect(id) { vm.playlist(id) }
    val s by vm.state.collectAsState()
    CollectionScaffold(s.header, s.tracks, s.loading, s.error, vm::retry, from = s.header?.title.orEmpty())
}

@Composable
fun GenreScreen(name: String, vm: CollectionViewModel = hiltViewModel()) {
    LaunchedEffect(name) { vm.genre(name) }
    val s by vm.state.collectAsState()
    CollectionScaffold(s.header, s.tracks, s.loading, s.error, vm::retry, from = name)
}

@Composable
fun LikedScreen(vm: CollectionViewModel = hiltViewModel()) {
    val tracks by vm.library.liked.collectAsState(initial = null)
    val list = tracks.orEmpty()
    CollectionScaffold(
        CollectionHeader("Liked Songs", "", "${list.size} songs", glyph = { GlyphTile(Icons.Rounded.Favorite) }),
        list, loading = tracks == null, error = null, onRetry = {}, from = "Liked Songs",
        emptyTitle = "No liked songs yet", emptyMessage = "",
    )
}

@Composable
fun HistoryScreen(vm: CollectionViewModel = hiltViewModel()) {
    val tracks by vm.library.history.collectAsState(initial = null)
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    CollectionScaffold(
        CollectionHeader("Recently played", "", "${tracks.orEmpty().size} songs", glyph = { GlyphTile(Icons.Rounded.History) }),
        tracks.orEmpty(), loading = tracks == null, error = null, onRetry = {}, from = "Recently played",
        emptyTitle = "Nothing played yet", emptyMessage = "",
        onMore = { menu = true },
    )
    if (menu) GtSheet({ menu = false }) {
        Column(Modifier.navigationBarsPadding().padding(bottom = Space.md)) {
            MenuItem(Icons.Rounded.DeleteSweep, "Clear listening history") { menu = false; confirm = true }
        }
    }
    if (confirm) ConfirmDialog("Clear history?", "This removes your recently played list on this phone.", "Clear", { vm.clearHistory(); confirm = false }, { confirm = false })
}

@Composable
fun DownloadsScreen(vm: CollectionViewModel = hiltViewModel()) {
    val items by vm.downloads.items.collectAsState(initial = null)
    val done = items.orEmpty().filter { it.state == DownloadRepository.STATE_DONE }
    val pending = items.orEmpty().filter { it.state != DownloadRepository.STATE_DONE }
    val bytes by produceState(0L, done.size) { value = vm.downloads.storageBytes() }
    var menu by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf(false) }
    val meta = buildString {
        append("${done.size} songs · ${formatBytes(bytes)}")
        if (pending.isNotEmpty()) append(" · ${pending.size} downloading")
    }
    CollectionScaffold(
        CollectionHeader("Downloads", "", meta, glyph = { GlyphTile(Icons.Rounded.Download) }),
        done.map { it.track }, loading = items == null, error = null, onRetry = {}, from = "Downloads",
        emptyTitle = "No downloads yet", emptyMessage = "",
        onMore = if (done.isNotEmpty()) ({ menu = true }) else null,
    )
    if (menu) GtSheet({ menu = false }) {
        Column(Modifier.navigationBarsPadding().padding(bottom = Space.md)) {
            MenuItem(Icons.Rounded.Delete, "Remove all downloads") { menu = false; confirm = true }
        }
    }
    if (confirm) ConfirmDialog("Remove all downloads?", "${done.size} songs (${formatBytes(bytes)}) will be deleted from this phone. You can download them again.", "Remove", { vm.removeAllDownloads(); confirm = false }, { confirm = false })
}

@Composable
fun UserPlaylistScreen(id: Long, vm: CollectionViewModel = hiltViewModel()) {
    val name by remember(id) { vm.library.playlistName(id) }.collectAsState(initial = null)
    val tracks by remember(id) { vm.library.playlistTracks(id) }.collectAsState(initial = null)
    val actions = LocalActions.current
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val list = tracks.orEmpty()
    val cover = list.firstOrNull()?.let { trackArtModel(it, ArtworkUrls.Size.Hero) }
    CollectionScaffold(
        name?.let { CollectionHeader(it, "Your playlist", "${list.size} songs", cover, glyph = if (cover == null) ({ GlyphTile(Icons.Rounded.Edit) }) else null) },
        list, loading = tracks == null, error = null, onRetry = {}, from = name.orEmpty(), playlistId = id,
        emptyTitle = "This playlist is empty", emptyMessage = "",
        onMore = { menu = true },
    )
    if (menu) GtSheet({ menu = false }) {
        Column(Modifier.navigationBarsPadding().padding(bottom = Space.md)) {
            MenuItem(Icons.Rounded.Edit, "Rename") { menu = false; renaming = true }
            MenuItem(Icons.Rounded.Delete, "Delete playlist") { menu = false; deleting = true }
        }
    }
    if (renaming) NameDialog("Rename playlist", name.orEmpty(), "Save", { vm.rename(id, it); renaming = false }, { renaming = false })
    if (deleting) ConfirmDialog("Delete ${name.orEmpty()}?", "This playlist will be deleted from this phone.", "Delete", {
        vm.delete(id); deleting = false; actions.nav.popBackStack()
    }, { deleting = false })
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = GT.Surface2,
        shape = RoundedCornerShape(Radii.sheet),
        title = { Text(title, style = TypeScale.title, color = GT.Text) },
        text = { Text(text, style = TypeScale.body, color = GT.TextSecondary) },
        confirmButton = { TextButton(onClick = onConfirm) { Text(confirm, style = TypeScale.label, color = GT.Accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", style = TypeScale.label, color = GT.TextSecondary) } },
    )
}

fun formatBytes(b: Long): String = when {
    b >= 1L shl 30 -> "%.1f GB".format(b / (1L shl 30).toDouble())
    b >= 1L shl 20 -> "%.0f MB".format(b / (1L shl 20).toDouble())
    b >= 1L shl 10 -> "%.0f KB".format(b / (1L shl 10).toDouble())
    else -> "$b B"
}
