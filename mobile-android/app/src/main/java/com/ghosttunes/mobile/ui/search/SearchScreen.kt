package com.ghosttunes.mobile.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.NorthWest
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.model.AlbumRef
import com.ghosttunes.mobile.data.model.ArtistRef
import com.ghosttunes.mobile.data.model.SearchAll
import com.ghosttunes.mobile.data.model.Suggestions
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.components.ArtCard
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.Chip
import com.ghosttunes.mobile.ui.components.ErrorState
import com.ghosttunes.mobile.ui.components.PlayButton
import com.ghosttunes.mobile.ui.components.RowSkeleton
import com.ghosttunes.mobile.ui.components.SectionHeader
import com.ghosttunes.mobile.ui.components.TrackRow
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.pressable
import com.ghosttunes.mobile.ui.components.rememberArtColor
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import javax.inject.Inject

val BROWSE = listOf("Afrobeats", "Amapiano", "Hip Hop", "R&B", "Gospel", "Highlife", "Pop", "Chill")

enum class Filter(val label: String) { All("All"), Songs("Songs"), Artists("Artists"), Albums("Albums"), Playlists("Playlists") }

data class SearchState(
    val query: String = "",
    val suggestions: Suggestions? = null,
    val results: SearchAll? = null,
    val loading: Boolean = false,
    val error: String? = null,
    val submitted: Boolean = false,
    val filter: Filter = Filter.All,
    val browse: List<Pair<String, Track?>> = BROWSE.map { it to null },
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val music: MusicRepository,
    private val settings: SettingsRepository,
    val json: Json,
) : ViewModel() {
    private val _state = MutableStateFlow(SearchState())
    val state: StateFlow<SearchState> = _state
    val recent = settings.settings
    private var suggestJob: Job? = null
    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            val tiles = BROWSE.map { g -> async { g to music.genre(g).getOrNull()?.firstOrNull() } }.awaitAll()
            _state.update { it.copy(browse = tiles) }
        }
    }

    fun onQuery(q: String) {
        _state.update { it.copy(query = q, submitted = false) }
        suggestJob?.cancel()
        searchJob?.cancel()
        if (q.isBlank()) {
            _state.update { it.copy(suggestions = null, results = null, error = null, loading = false) }
            return
        }
        suggestJob = viewModelScope.launch {
            delay(250)
            music.suggestions(q.trim()).onSuccess { s -> if (_state.value.query == q) _state.update { it.copy(suggestions = s) } }
        }
        // Instant results after a short pause in typing.
        searchJob = viewModelScope.launch {
            delay(600)
            search(q, remember = false)
        }
    }

    fun submit(q: String = _state.value.query) {
        if (q.isBlank()) return
        _state.update { it.copy(query = q, submitted = true) }
        searchJob?.cancel()
        searchJob = viewModelScope.launch { search(q, remember = true) }
    }

    private suspend fun search(q: String, remember: Boolean) {
        _state.update { it.copy(loading = it.results == null || it.results.query != q.trim(), error = null) }
        music.searchAll(q.trim())
            .onSuccess { r -> if (_state.value.query.trim() == q.trim()) _state.update { it.copy(results = r, loading = false) } }
            .onFailure { e -> _state.update { it.copy(error = e.message, loading = false) } }
        if (remember) settings.addRecentSearch(q)
    }

    fun setFilter(f: Filter) = _state.update { it.copy(filter = f) }
    fun removeRecent(q: String) = viewModelScope.launch { settings.removeRecentSearch(q) }
    fun clearRecent() = viewModelScope.launch { settings.clearRecentSearches() }
    fun rememberQuery() = viewModelScope.launch { settings.addRecentSearch(_state.value.query) }
}

@Composable
fun SearchScreen(vm: SearchViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val settings by vm.recent.collectAsState()
    val actions = LocalActions.current
    val bottom = LocalBottomPadding.current
    val focus = LocalFocusManager.current

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.statusBarsPadding().padding(horizontal = Space.edge, vertical = Space.sm)) {
            Text("Search", style = TypeScale.headline, color = GT.Text, modifier = Modifier.padding(bottom = Space.sm))
            SearchField(state.query, onChange = vm::onQuery, onSubmit = { focus.clearFocus(); vm.submit() })
        }

        val results = state.results
        if (state.query.isNotBlank() && results != null && results.query == state.query.trim()) {
            LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                items(Filter.entries) { f -> Chip(f.label, state.filter == f, onClick = { vm.setFilter(f) }) }
            }
        }

        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = Space.xs, bottom = bottom)) {
            when {
                state.query.isBlank() -> {
                    if (settings.recentSearches.isNotEmpty()) {
                        item(key = "rh") { SectionHeader("Recent searches", action = "Clear", onAction = { vm.clearRecent() }) }
                        items(settings.recentSearches.take(6), key = { "r-$it" }) { q ->
                            SuggestionRow(q, Icons.Rounded.History, onClick = { vm.submit(q) }, onRemove = { vm.removeRecent(q) })
                        }
                    }
                    item(key = "bh") { SectionHeader("Browse") }
                    item(key = "browse") { BrowseGrid(state.browse) { actions.openGenre(it) } }
                }
                state.error != null && results == null -> item(key = "err") { ErrorState(state.error ?: "", onRetry = { vm.submit() }) }
                results == null || results.query != state.query.trim() -> {
                    state.suggestions?.suggestions?.take(6)?.forEach { s ->
                        item(key = "s-$s") { SuggestionRow(s, Icons.Rounded.Search, onClick = { focus.clearFocus(); vm.submit(s) }, onFill = { vm.onQuery("$s ") }) }
                    }
                    if (state.loading || state.suggestions == null) items(6) { RowSkeleton() }
                }
                else -> resultItems(results, state.filter, vm.json, onPlay = { vm.rememberQuery() })
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.resultItems(r: SearchAll, filter: Filter, json: Json, onPlay: () -> Unit) {
    val empty = r.songs.isEmpty() && r.artists.isEmpty() && r.albums.isEmpty() && r.playlists.isEmpty()
    if (empty) {
        item(key = "none") { ErrorState("Check the spelling, or try fewer words.", null, title = "No results for \"${r.query}\"") }
        return
    }
    when (filter) {
        Filter.All -> {
            r.top?.let { top -> item(key = "top") { TopResultCard(top.type, top.item, json, r.songs, onPlay) } }
            if (r.songs.isNotEmpty()) {
                item(key = "sh") { SectionHeader("Songs") }
                items(r.songs.take(4), key = { "song-${it.id}" }) { t -> SongRow(t, r.songs, onPlay) }
            }
            if (r.artists.isNotEmpty()) {
                item(key = "ah") { SectionHeader("Artists") }
                item(key = "ar") {
                    LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                        items(r.artists, key = { it.id }) { a -> ArtistCard(a) }
                    }
                }
            }
            if (r.albums.isNotEmpty()) {
                item(key = "alh") { SectionHeader("Albums") }
                item(key = "alr") {
                    LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        items(r.albums, key = { it.id }) { a -> AlbumCard(a) }
                    }
                }
            }
            if (r.playlists.isNotEmpty()) {
                item(key = "plh") { SectionHeader("Playlists") }
                item(key = "plr") {
                    LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        items(r.playlists, key = { it.id }) { p -> PlaylistCard(p) }
                    }
                }
            }
        }
        Filter.Songs -> items(r.songs, key = { "song-${it.id}" }) { t -> SongRow(t, r.songs, onPlay) }
        Filter.Artists -> items(r.artists, key = { it.id }) { a -> ArtistListRow(a) }
        Filter.Albums -> items(r.albums, key = { it.id }) { a -> AlbumListRow(a) }
        Filter.Playlists -> items(r.playlists, key = { it.id }) { p -> PlaylistListRow(p) }
    }
}

@Composable
private fun SongRow(t: Track, all: List<Track>, onPlay: () -> Unit) {
    val actions = LocalActions.current
    TrackRow(t, onClick = { onPlay(); actions.play(all, all.indexOf(t), "Search") }, subtitle = "Song · ${t.artist}", onMore = { actions.trackMenu(t) })
}

@Composable
private fun ArtistCard(a: ArtistRef) {
    val actions = LocalActions.current
    ArtCard(a.name, "Artist", ArtworkUrls.sized(a.avatar, ArtworkUrls.Size.Card), onClick = { actions.openArtist(a.id, a.name) }, size = 112.dp, circle = true)
}

@Composable
private fun AlbumCard(a: AlbumRef) {
    val actions = LocalActions.current
    ArtCard(a.title, listOf(a.year, a.artist).filter { it.isNotBlank() }.joinToString(" · "), ArtworkUrls.sized(a.thumbnail, ArtworkUrls.Size.Card), onClick = { actions.openAlbum(a.id) })
}

@Composable
private fun PlaylistCard(p: com.ghosttunes.mobile.data.model.PlaylistRef) {
    val actions = LocalActions.current
    ArtCard(p.title, p.author, ArtworkUrls.sized(p.thumbnail, ArtworkUrls.Size.Card), onClick = { actions.openPlaylist(p.id) })
}

@Composable
private fun ListRow(title: String, subtitle: String, art: String?, circle: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = Space.row).clickable(onClick = onClick).padding(horizontal = Space.edge),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Artwork(ArtworkUrls.sized(art, ArtworkUrls.Size.Row), null, Modifier.size(Space.rowArt), if (circle) CircleShape else RoundedCornerShape(Radii.rowArt))
        Spacer(Modifier.width(Space.sm))
        Column(Modifier.weight(1f)) {
            Text(title, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = TypeScale.body, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable private fun ArtistListRow(a: ArtistRef) { val n = LocalActions.current; ListRow(a.name, a.subtitle.ifBlank { "Artist" }, a.avatar, true) { n.openArtist(a.id, a.name) } }
@Composable private fun AlbumListRow(a: AlbumRef) { val n = LocalActions.current; ListRow(a.title, listOf(a.type.replaceFirstChar { it.uppercase() }, a.artist, a.year).filter { it.isNotBlank() }.joinToString(" · "), a.thumbnail, false) { n.openAlbum(a.id) } }
@Composable private fun PlaylistListRow(p: com.ghosttunes.mobile.data.model.PlaylistRef) { val n = LocalActions.current; ListRow(p.title, listOf("Playlist", p.author).filter { it.isNotBlank() }.joinToString(" · "), p.thumbnail, false) { n.openPlaylist(p.id) } }

@Composable
private fun TopResultCard(type: String, item: kotlinx.serialization.json.JsonObject, json: Json, songs: List<Track>, onPlay: () -> Unit) {
    val actions = LocalActions.current
    val (title, subtitle, art, circle) = when (type) {
        "artist" -> json.decodeFromJsonElement<ArtistRef>(item).let { Quad(it.name, "Artist", it.avatar, true) }
        "album" -> json.decodeFromJsonElement<AlbumRef>(item).let { Quad(it.title, "Album · ${it.artist}", it.thumbnail, false) }
        else -> json.decodeFromJsonElement<Track>(item).let { Quad(it.title, "Song · ${it.artist}", it.thumbnail, false) }
    }
    val model = ArtworkUrls.sized(art, ArtworkUrls.Size.Card)
    val color by rememberArtColor(model)
    val onOpen: () -> Unit = {
        when (type) {
            "artist" -> json.decodeFromJsonElement<ArtistRef>(item).let { actions.openArtist(it.id, it.name) }
            "album" -> actions.openAlbum(json.decodeFromJsonElement<AlbumRef>(item).id)
            else -> json.decodeFromJsonElement<Track>(item).let { t -> onPlay(); actions.play(listOf(t) + songs.filter { it.id != t.id }, 0, "Search") }
        }
    }
    SectionHeader("Top result")
    Row(
        Modifier
            .padding(horizontal = Space.edge)
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.hero))
            .background(color.mix(GT.Surface2, 0.5f))
            .pressable(onOpen, label = title)
            .padding(Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Artwork(model, null, Modifier.size(88.dp), if (circle) CircleShape else RoundedCornerShape(Radii.card))
        Spacer(Modifier.width(Space.md))
        Column(Modifier.weight(1f)) {
            Text(title, style = TypeScale.title, color = GT.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(Space.xxs))
            Text(subtitle, style = TypeScale.body, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (type == "song") PlayButton(false, onClick = onOpen, size = 48.dp)
    }
}

private data class Quad(val a: String, val b: String, val c: String, val d: Boolean)

@Composable
private fun SearchField(value: String, onChange: (String) -> Unit, onSubmit: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(Space.touch).clip(RoundedCornerShape(Radii.hero)).background(GT.Text).padding(start = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Search, null, tint = GT.Bg, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(Space.xs))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text("What do you want to listen to?", style = TypeScale.body.copy(fontWeight = TypeScale.bodyLarge.fontWeight), color = GT.Bg.copy(alpha = 0.6f), maxLines = 1)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TypeScale.body.copy(color = GT.Bg, fontWeight = TypeScale.bodyLarge.fontWeight),
                cursorBrush = SolidColor(GT.Accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSubmit() }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (value.isNotEmpty()) {
            IconButton(onClick = { onChange("") }) { Icon(Icons.Rounded.Close, "Clear search", tint = GT.Bg) }
        }
    }
}

@Composable
private fun SuggestionRow(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit, onFill: (() -> Unit)? = null, onRemove: (() -> Unit)? = null) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(onClick = onClick).padding(start = Space.edge, end = Space.xxs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = GT.TextSecondary, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(Space.md))
        Text(text, style = TypeScale.bodyLarge.copy(fontWeight = TypeScale.body.fontWeight), color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        when {
            onRemove != null -> IconButton(onClick = onRemove) { Icon(Icons.Rounded.Close, "Remove $text", tint = GT.TextSecondary, modifier = Modifier.size(20.dp)) }
            onFill != null -> IconButton(onClick = onFill) { Icon(Icons.Rounded.NorthWest, "Edit search: $text", tint = GT.TextSecondary, modifier = Modifier.size(20.dp)) }
        }
    }
}

/** Two-column tiles; color and tilted art come from each genre's top song. */
@Composable
private fun BrowseGrid(tiles: List<Pair<String, Track?>>, onOpen: (String) -> Unit) {
    Column(Modifier.padding(horizontal = Space.edge), verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        tiles.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                row.forEach { (genre, track) ->
                    val model = track?.let { trackArtModel(it, ArtworkUrls.Size.Card) }
                    val color by rememberArtColor(model, fallback = GT.Surface3)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(96.dp)
                            .clip(RoundedCornerShape(Radii.hero))
                            .background(color)
                            .pressable({ onOpen(genre) }, label = genre),
                    ) {
                        Text(genre, style = TypeScale.bodyLarge.copy(fontWeight = TypeScale.title.fontWeight), color = GT.Text, modifier = Modifier.padding(Space.sm))
                        if (model != null) {
                            Artwork(
                                model, null,
                                Modifier
                                    .align(Alignment.BottomEnd)
                                    .offset(x = 14.dp, y = 6.dp)
                                    .size(64.dp)
                                    .graphicsLayer { rotationZ = 22f },
                                RoundedCornerShape(Radii.rowArt),
                            )
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}
