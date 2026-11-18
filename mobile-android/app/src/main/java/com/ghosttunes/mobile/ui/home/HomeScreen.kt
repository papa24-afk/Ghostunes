package com.ghosttunes.mobile.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.DownloadsRoute
import com.ghosttunes.mobile.ui.SettingsRoute
import com.ghosttunes.mobile.ui.components.ArtCard
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.CardSkeleton
import com.ghosttunes.mobile.ui.components.PillButton
import com.ghosttunes.mobile.ui.components.SectionHeader
import com.ghosttunes.mobile.ui.components.pressable
import com.ghosttunes.mobile.ui.components.shimmer
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Calendar
import javax.inject.Inject

data class Mix(val seed: Track, val tracks: List<Track>) {
    val title get() = "${seed.artist.substringBefore(",").trim()} Mix"
    val subtitle: String get() {
        val others = tracks.map { it.artist.substringBefore(",").trim() }.filter { it != seed.artist.substringBefore(",").trim() }.distinct().take(3)
        return if (others.isEmpty()) "Based on ${seed.title}" else "With " + others.joinToString(", ")
    }
}

data class ArtistChip(val name: String, val id: String?, val avatar: String?)

data class HomeState(
    val loading: Boolean = true,
    val offline: Boolean = false,
    val offlineReason: String = "",
    val trending: List<Track> = emptyList(),
    val mixes: List<Mix>? = null,
    val shelves: List<Pair<String, List<Track>>> = emptyList(),
    val artists: List<ArtistChip> = emptyList(),
    val refreshing: Boolean = false,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val music: MusicRepository,
    private val library: LibraryRepository,
    downloads: DownloadRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeState())
    val state: StateFlow<HomeState> = _state
    val recent: StateFlow<List<Track>> = library.recent(6).stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val downloaded = downloads.items.map { l -> l.filter { it.state == DownloadRepository.STATE_DONE }.map { it.track } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init { load() }

    fun refresh() {
        music.clearCache()
        _state.update { it.copy(refreshing = true) }
        load()
    }

    private fun load() = viewModelScope.launch {
        val trending = music.home()
        if (trending.isFailure) {
            _state.value = HomeState(loading = false, offline = true, offlineReason = trending.exceptionOrNull()?.message.orEmpty())
            return@launch
        }
        val top = trending.getOrThrow()
        _state.update { it.copy(loading = false, offline = false, trending = top, refreshing = false) }

        launch {
            val shelves = listOf("Afrobeats", "Hip Hop", "R&B").map { g -> async { g to music.genre(g).getOrNull().orEmpty() } }.awaitAll()
            _state.update { it.copy(shelves = shelves.filter { s -> s.second.isNotEmpty() }) }
        }

        launch {
            // Mixes seeded from what you play most; fall back to trending on a fresh install.
            val played = library.mostPlayed(40)
            val seeds = (played + top).distinctBy { it.artist.substringBefore(",").trim().lowercase() }.take(4)
            val mixes = seeds.map { seed -> async { music.radio(seed).getOrNull()?.let { Mix(seed, it) } } }.awaitAll().filterNotNull()
            _state.update { it.copy(mixes = mixes) }
        }

        launch {
            val recentTracks = library.recent(40).first()
            val names = recentTracks.map { it.artist.substringBefore(",").trim() to it.artistId }.distinctBy { it.first.lowercase() }.take(8)
            _state.update { s -> s.copy(artists = names.map { ArtistChip(it.first, it.second, null) }) }
            val withAvatars = names.map { (n, id) -> async { ArtistChip(n, id, music.avatar(n).getOrNull()) } }.awaitAll()
            _state.update { it.copy(artists = withAvatars) }
        }
    }
}

private fun greeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
    in 5..11 -> "Good morning"
    in 12..16 -> "Good afternoon"
    else -> "Good evening"
}

@Composable
fun HomeScreen(vm: HomeViewModel = hiltViewModel()) {
    val state by vm.state.collectAsState()
    val recent by vm.recent.collectAsState()
    val downloaded by vm.downloaded.collectAsState()
    val actions = LocalActions.current
    val bottom = LocalBottomPadding.current

    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottom)) {
            item(key = "header") {
                Row(
                    Modifier.statusBarsPadding().fillMaxWidth().padding(start = Space.edge, end = Space.xxs, top = Space.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(greeting(), style = TypeScale.headline, color = GT.Text, modifier = Modifier.weight(1f))
                    IconButton(onClick = { actions.nav.navigate(SettingsRoute) }) { Icon(Icons.Rounded.Settings, "Settings", tint = GT.Text) }
                }
            }

            if (state.offline) {
                item(key = "offline") { OfflineCard(state.offlineReason, onRetry = vm::refresh, onSettings = { actions.nav.navigate(SettingsRoute) }) }
                if (downloaded.isNotEmpty()) {
                    item(key = "dl-h") { SectionHeader("Your downloads", action = "Show all") { actions.nav.navigate(DownloadsRoute) } }
                    item(key = "dl") { TrackCarousel(downloaded, from = "Downloads") }
                }
            }

            if (recent.isNotEmpty()) {
                item(key = "recent") { JumpBackIn(recent) }
            }

            if (!state.offline) {
                item(key = "mix-h") { SectionHeader("Made for you") }
                item(key = "mixes") {
                    val mixes = state.mixes
                    LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                        if (mixes == null) items(4) { CardSkeleton() }
                        else items(mixes, key = { it.seed.id }) { mix ->
                            ArtCard(mix.title, mix.subtitle, trackArtModel(mix.seed, ArtworkUrls.Size.Card),
                                onClick = { actions.play(listOf(mix.seed) + mix.tracks.filter { it.id != mix.seed.id }, 0, mix.title) })
                        }
                    }
                }

                if (state.artists.isNotEmpty()) {
                    item(key = "artists-h") { SectionHeader("Your artists") }
                    item(key = "artists") {
                        LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                            items(state.artists, key = { it.name }) { a ->
                                ArtCard(a.name, "", a.avatar?.let { ArtworkUrls.sized(it, ArtworkUrls.Size.Card) }, onClick = { actions.openArtist(a.id ?: "", a.name) }, size = 112.dp, circle = true)
                            }
                        }
                    }
                }

                item(key = "trend-h") { SectionHeader("Trending now", action = "Play all") { actions.play(state.trending, 0, "Trending now") } }
                item(key = "trend") {
                    if (state.loading) SkeletonCarousel() else TrackCarousel(state.trending, from = "Trending now")
                }

                state.shelves.forEach { (genre, tracks) ->
                    item(key = "g-h-$genre") { SectionHeader(genre, action = "Show all") { actions.openGenre(genre) } }
                    item(key = "g-$genre") { TrackCarousel(tracks, from = genre) }
                }
                if (state.shelves.isEmpty() && !state.loading) {
                    item(key = "shelf-skel") { Column { SectionHeader("Afrobeats"); SkeletonCarousel() } }
                }
            }
        }
    }
}

@Composable
private fun TrackCarousel(tracks: List<Track>, from: String) {
    val actions = LocalActions.current
    LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
        items(tracks.size, key = { tracks[it].id + it }) { i ->
            val t = tracks[i]
            ArtCard(t.title, t.artist, trackArtModel(t, ArtworkUrls.Size.Card), onClick = { actions.play(tracks, i, from) }, onLongClick = { actions.trackMenu(t) })
        }
    }
}

@Composable
private fun SkeletonCarousel() {
    LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.sm), userScrollEnabled = false) {
        items(4) { CardSkeleton() }
    }
}

/** Spotify's two-column shortcut grid. */
@Composable
private fun JumpBackIn(recent: List<Track>) {
    val actions = LocalActions.current
    Column(Modifier.padding(horizontal = Space.edge, vertical = Space.sm), verticalArrangement = Arrangement.spacedBy(Space.xs)) {
        recent.chunked(2).forEachIndexed { row, pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                pair.forEachIndexed { col, t ->
                    val index = row * 2 + col
                    Row(
                        Modifier
                            .weight(1f)
                            .height(56.dp)
                            .clip(RoundedCornerShape(Radii.rowArt))
                            .background(GT.Surface2)
                            .pressable(onClick = { actions.play(recent, index, "Recently played") }, onLongClick = { actions.trackMenu(t) }, label = t.title),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Artwork(trackArtModel(t, ArtworkUrls.Size.Row), null, Modifier.size(56.dp), RoundedCornerShape(topStart = Radii.rowArt, bottomStart = Radii.rowArt))
                        Text(
                            t.title, style = TypeScale.label, color = GT.Text, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = Space.xs).weight(1f),
                        )
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun OfflineCard(reason: String, onRetry: () -> Unit, onSettings: () -> Unit) {
    Column(
        Modifier.padding(Space.edge).fillMaxWidth().clip(RoundedCornerShape(Radii.sheet)).background(GT.Surface2).padding(Space.lg),
    ) {
        Icon(Icons.Rounded.CloudOff, null, tint = GT.TextSecondary, modifier = Modifier.size(28.dp))
        Spacer(Modifier.height(Space.sm))
        Text("Can't load music right now", style = TypeScale.title, color = GT.Text)
        Spacer(Modifier.height(Space.xxs))
        Text(
            reason.ifBlank { "Check your internet connection." } + if (reason.contains("download")) "" else " Your downloads still play.",
            style = TypeScale.body, color = GT.TextSecondary,
        )
        Spacer(Modifier.height(Space.md))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
            PillButton("Try again", onRetry, filled = true)
            PillButton("Settings", onSettings)
        }
    }
}
