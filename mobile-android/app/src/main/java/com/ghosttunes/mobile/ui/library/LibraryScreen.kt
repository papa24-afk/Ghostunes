package com.ghosttunes.mobile.ui.library

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.ViewList
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.ui.ArtistRoute
import com.ghosttunes.mobile.ui.DownloadsRoute
import com.ghosttunes.mobile.ui.HistoryRoute
import com.ghosttunes.mobile.ui.LikedRoute
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.LocalMainVm
import com.ghosttunes.mobile.ui.UserPlaylistRoute
import com.ghosttunes.mobile.ui.common.NameDialog
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.Chip
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.pressable
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class LibFilter(val label: String) { Playlists("Playlists"), Artists("Artists"), Downloaded("Downloaded") }

/** One row in the library list/grid. */
data class LibItem(
    val key: String,
    val title: String,
    val subtitle: String,
    val art: Any?,
    val glyph: ImageVector? = null,
    val circle: Boolean = false,
    val pinned: Boolean = false,
    val sortTime: Long = 0,
    val kind: LibFilter? = null,
    val open: (com.ghosttunes.mobile.ui.AppActions) -> Unit,
)

@HiltViewModel
class LibraryViewModel @Inject constructor(
    library: LibraryRepository,
    downloads: DownloadRepository,
    private val settings: SettingsRepository,
) : ViewModel() {
    val prefs = settings.settings
    val data = combine(library.liked, library.playlists, library.followed, downloads.items, library.recent(1)) { liked, playlists, followed, dl, recent ->
        LibData(liked.size, playlists, followed, dl.count { it.state == DownloadRepository.STATE_DONE }, recent.firstOrNull())
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun setGrid(v: Boolean) = viewModelScope.launch { settings.setLibraryGrid(v) }
    fun setSort(v: Int) = viewModelScope.launch { settings.setLibrarySort(v) }
}

data class LibData(
    val likedCount: Int,
    val playlists: List<com.ghosttunes.mobile.data.repo.UserPlaylist>,
    val followed: List<com.ghosttunes.mobile.data.repo.FollowedArtist>,
    val downloadCount: Int,
    val lastPlayed: com.ghosttunes.mobile.data.model.Track?,
)

@Composable
fun LibraryScreen(vm: LibraryViewModel = hiltViewModel()) {
    val data by vm.data.collectAsState()
    val prefs by vm.prefs.collectAsState()
    val main = LocalMainVm.current
    val bottom = LocalBottomPadding.current
    var filter by remember { mutableStateOf<LibFilter?>(null) }
    var creating by remember { mutableStateOf(false) }

    val items = remember(data, filter, prefs.librarySort) {
        val d = data ?: return@remember emptyList()
        val list = mutableListOf<LibItem>()
        list += LibItem("liked", "Liked Songs", "Playlist · ${d.likedCount} songs", null, Icons.Rounded.Favorite, pinned = true, kind = LibFilter.Playlists) { it.nav.navigate(LikedRoute) }
        list += LibItem("downloads", "Downloads", "${d.downloadCount} songs · plays offline", null, Icons.Rounded.Download, pinned = true, kind = LibFilter.Downloaded) { it.nav.navigate(DownloadsRoute) }
        list += LibItem("history", "Recently played", d.lastPlayed?.let { "Last: ${it.title}" } ?: "Nothing yet", null, Icons.Rounded.History, pinned = true) { it.nav.navigate(HistoryRoute) }
        val rest = mutableListOf<LibItem>()
        d.playlists.forEach { p ->
            rest += LibItem("pl-${p.id}", p.name, "Playlist · ${p.count} songs", p.cover, kind = LibFilter.Playlists, sortTime = p.updatedAt) { it.nav.navigate(UserPlaylistRoute(p.id)) }
        }
        d.followed.forEach { a ->
            rest += LibItem("ar-${a.id}", a.name, "Artist", ArtworkUrls.sized(a.avatar, ArtworkUrls.Size.Card), circle = true, kind = LibFilter.Artists) { it.nav.navigate(ArtistRoute(a.id, a.name)) }
        }
        val sorted = if (prefs.librarySort == 1) rest.sortedBy { it.title.lowercase() } else rest.sortedByDescending { it.sortTime }
        (list + sorted).filter { filter == null || it.kind == filter }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.statusBarsPadding().fillMaxWidth().padding(start = Space.edge, end = Space.xxs, top = Space.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Your Library", style = TypeScale.headline, color = GT.Text, modifier = Modifier.weight(1f))
            IconButton(onClick = { creating = true }) { Icon(Icons.Rounded.Add, "Create playlist", tint = GT.Text) }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = Space.edge, vertical = Space.xs), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            items(LibFilter.entries) { f -> Chip(f.label, filter == f, { filter = if (filter == f) null else f }) }
        }
        Row(Modifier.fillMaxWidth().padding(start = Space.xs, end = Space.xxs), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.clip(CircleShape).clickable { vm.setSort(if (prefs.librarySort == 0) 1 else 0) }.heightIn(min = Space.touch).padding(horizontal = Space.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.AutoMirrored.Rounded.Sort, null, tint = GT.Text, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.xs))
                Text(if (prefs.librarySort == 0) "Recents" else "Alphabetical", style = TypeScale.label, color = GT.Text)
            }
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { vm.setGrid(!prefs.libraryGrid) }) {
                Icon(if (prefs.libraryGrid) Icons.Rounded.ViewList else Icons.Rounded.GridView, if (prefs.libraryGrid) "Show as list" else "Show as grid", tint = GT.Text, modifier = Modifier.size(20.dp))
            }
        }

        LazyVerticalGrid(
            columns = if (prefs.libraryGrid) GridCells.Fixed(3) else GridCells.Fixed(1),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = if (prefs.libraryGrid) Space.edge else 0.dp, end = if (prefs.libraryGrid) Space.edge else 0.dp, bottom = bottom),
            horizontalArrangement = Arrangement.spacedBy(if (prefs.libraryGrid) Space.sm else 0.dp),
            verticalArrangement = Arrangement.spacedBy(if (prefs.libraryGrid) Space.md else 0.dp),
        ) {
            items(items, key = { it.key }) { item -> if (prefs.libraryGrid) GridTile(item) else ListTile(item) }
            if (data != null && data!!.playlists.isEmpty() && (filter == null || filter == LibFilter.Playlists)) {
                item(key = "hint", span = { GridItemSpan(maxLineSpan) }) {
                    Column(Modifier.padding(Space.edge)) {
                        Text("Create your first playlist", style = TypeScale.bodyLarge, color = GT.Text)
                        Text("Tap + above, or use Add to playlist from any song.", style = TypeScale.body, color = GT.TextSecondary)
                    }
                }
            }
        }
    }

    if (creating) {
        NameDialog("Name your playlist", "", "Create", { name -> main.createPlaylistWith(name, null); creating = false }, { creating = false })
    }
}

@Composable
private fun Cover(item: LibItem, modifier: Modifier) {
    val shape = if (item.circle) CircleShape else RoundedCornerShape(Radii.rowArt)
    if (item.glyph != null) {
        Box(modifier.clip(shape).background(GT.Accent.mix(GT.Bg, 0.35f)), contentAlignment = Alignment.Center) {
            Icon(item.glyph, null, tint = GT.Text, modifier = Modifier.size(22.dp))
        }
    } else {
        val model = when (val a = item.art) {
            is com.ghosttunes.mobile.data.model.Track -> trackArtModel(a, ArtworkUrls.Size.Card)
            else -> a
        }
        Artwork(model, null, modifier, shape)
    }
}

@Composable
private fun ListTile(item: LibItem) {
    val actions = LocalActions.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = 72.dp).clickable { item.open(actions) }.padding(horizontal = Space.edge, vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Cover(item, Modifier.size(56.dp))
        Spacer(Modifier.width(Space.sm))
        Column(Modifier.weight(1f)) {
            Text(item.title, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (item.pinned) {
                    Icon(Icons.Rounded.PushPin, "Pinned", tint = GT.Accent, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(Space.xxs))
                }
                Text(item.subtitle, style = TypeScale.body, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun GridTile(item: LibItem) {
    val actions = LocalActions.current
    Column(Modifier.pressable({ item.open(actions) }, label = item.title)) {
        Cover(item, Modifier.fillMaxWidth().aspectRatio(1f))
        Spacer(Modifier.height(Space.xs))
        Text(item.title, style = TypeScale.label, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(item.subtitle, style = TypeScale.caption, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
