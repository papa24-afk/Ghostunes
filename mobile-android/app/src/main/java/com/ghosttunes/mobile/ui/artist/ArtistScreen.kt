package com.ghosttunes.mobile.ui.artist

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.data.model.ArtistPage
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.data.repo.FollowedArtist
import com.ghosttunes.mobile.data.repo.LibraryRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.LocalMainVm
import com.ghosttunes.mobile.ui.components.ArtCard
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.Chip
import com.ghosttunes.mobile.ui.components.ErrorState
import com.ghosttunes.mobile.ui.components.PillButton
import com.ghosttunes.mobile.ui.components.PlayButton
import com.ghosttunes.mobile.ui.components.RowSkeleton
import com.ghosttunes.mobile.ui.components.SectionHeader
import com.ghosttunes.mobile.ui.components.TrackRow
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.rememberArtColor
import com.ghosttunes.mobile.ui.components.shimmer
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ArtistUi(val page: ArtistPage? = null, val loading: Boolean = true, val error: String? = null)

@HiltViewModel
class ArtistViewModel @Inject constructor(private val music: MusicRepository, private val library: LibraryRepository) : ViewModel() {
    private val _state = MutableStateFlow(ArtistUi())
    val state: StateFlow<ArtistUi> = _state
    val followedIds = library.followed.map { l -> l.map { it.id }.toSet() }.stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())
    private var args: Pair<String, String> = "" to ""

    fun load(id: String, name: String) {
        args = id to name
        _state.value = ArtistUi(loading = true)
        viewModelScope.launch {
            music.artist(id.ifBlank { null }, name).onSuccess { _state.value = ArtistUi(it, false) }
                .onFailure { _state.value = ArtistUi(null, false, it.message) }
        }
    }

    fun retry() = load(args.first, args.second)

    fun toggleFollow(p: ArtistPage) = viewModelScope.launch {
        if (p.id in followedIds.value) library.unfollow(p.id) else library.follow(FollowedArtist(p.id, p.name, p.avatar))
    }
}

@Composable
fun ArtistScreen(id: String, name: String, vm: ArtistViewModel = hiltViewModel()) {
    LaunchedEffect(id, name) { vm.load(id, name) }
    val state by vm.state.collectAsState()
    val followed by vm.followedIds.collectAsState()
    val main = LocalMainVm.current
    val player by main.player.collectAsState()
    val actions = LocalActions.current
    val bottom = LocalBottomPadding.current
    val list = rememberLazyListState()
    val page = state.page
    val banner = page?.banner?.takeIf { it.isNotBlank() }
    val color by rememberArtColor(banner, fallback = GT.Surface3)
    var showAllPopular by remember { mutableStateOf(false) }
    var discography by remember { mutableStateOf(0) }

    val scrolled by remember { derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 500 } }
    val bannerOffset by remember { derivedStateOf { if (list.firstVisibleItemIndex == 0) list.firstVisibleItemScrollOffset.toFloat() else 0f } }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(state = list, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottom)) {
            item(key = "banner") {
                Box(Modifier.fillMaxWidth().height(340.dp)) {
                    if (banner != null) {
                        Artwork(
                            banner, "Photo of ${page.name}",
                            Modifier.fillMaxSize().graphicsLayer { translationY = bannerOffset * 0.5f; alpha = 1f - (bannerOffset / 900f).coerceIn(0f, 0.6f) },
                            RoundedCornerShape(0.dp),
                        )
                    } else {
                        Box(Modifier.fillMaxSize().shimmer())
                    }
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to GT.Bg)))
                    Text(
                        page?.name ?: name, style = TypeScale.display.copy(fontSize = TypeScale.display.fontSize * 1.25f),
                        color = GT.Text, maxLines = 2, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.align(Alignment.BottomStart).padding(horizontal = Space.edge, vertical = Space.md),
                    )
                }
            }

            if (state.error != null && page == null) {
                item(key = "err") { ErrorState(state.error ?: "", vm::retry) }
                return@LazyColumn
            }

            item(key = "actions") {
                Row(Modifier.fillMaxWidth().padding(start = Space.edge, end = Space.edge, top = Space.xs), verticalAlignment = Alignment.CenterVertically) {
                    if (page != null) {
                        val isFollowed = page.id in followed
                        PillButton(if (isFollowed) "Following" else "Follow", { vm.toggleFollow(page) }, modifier = Modifier.height(36.dp))
                        if (page.subscribers.isNotBlank()) {
                            Spacer(Modifier.width(Space.sm))
                            Text(page.subscribers, style = TypeScale.label, color = GT.TextSecondary, maxLines = 1)
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    val tracks = page?.topTracks.orEmpty()
                    if (tracks.isNotEmpty()) {
                        IconButton(onClick = { actions.play(tracks, 0, page!!.name, shuffle = true) }) { Icon(Icons.Rounded.Shuffle, "Shuffle play", tint = GT.Text) }
                        Spacer(Modifier.width(Space.xs))
                        val playingHere = player.playWhenReady && tracks.any { it.id == player.current?.id }
                        PlayButton(playingHere, onClick = { if (playingHere) main.playback.togglePlay() else actions.play(tracks, 0, page!!.name) })
                    }
                }
            }

            item(key = "pop-h") { SectionHeader("Popular") }
            if (page == null) {
                items(5) { RowSkeleton() }
            } else {
                val shown = if (showAllPopular) page.topTracks else page.topTracks.take(5)
                itemsIndexed(shown, key = { i, t -> "pop-${t.id}-$i" }) { i, t ->
                    TrackRow(
                        t, onClick = { actions.play(page.topTracks, i, page.name) },
                        isCurrent = player.current?.id == t.id, isPlaying = player.isPlaying,
                        index = i + 1, subtitle = if (t.durationSeconds > 0) "${t.artist} · ${t.duration}" else t.artist,
                        onMore = { actions.trackMenu(t) },
                    )
                }
                if (page.topTracks.size > 5) {
                    item(key = "pop-more") {
                        Text(
                            if (showAllPopular) "Show less" else "See more", style = TypeScale.label, color = GT.TextSecondary,
                            modifier = Modifier.padding(horizontal = Space.edge, vertical = Space.xs).clip(CircleShape)
                                .clickable { showAllPopular = !showAllPopular }.padding(Space.xs),
                        )
                    }
                }

                val hasAlbums = page.albums.isNotEmpty()
                val hasSingles = page.singles.isNotEmpty()
                if (hasAlbums || hasSingles) {
                    item(key = "disc-h") { SectionHeader("Discography") }
                    item(key = "disc-chips") {
                        Row(Modifier.padding(horizontal = Space.edge, vertical = Space.xxs), horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                            if (hasAlbums) Chip("Albums", discography == 0 || !hasSingles, { discography = 0 })
                            if (hasSingles) Chip("Singles and EPs", discography == 1 || !hasAlbums, { discography = 1 })
                        }
                    }
                    item(key = "disc") {
                        val refs = if ((discography == 0 && hasAlbums) || !hasSingles) page.albums else page.singles
                        LazyRow(contentPadding = PaddingValues(horizontal = Space.edge, vertical = Space.sm), horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                            items(refs, key = { it.id }) { a ->
                                ArtCard(a.title, a.year, ArtworkUrls.sized(a.thumbnail, ArtworkUrls.Size.Card), onClick = { actions.openAlbum(a.id) })
                            }
                        }
                    }
                }

                if (page.similarArtists.isNotEmpty()) {
                    item(key = "fans-h") { SectionHeader("Fans also like") }
                    item(key = "fans") {
                        LazyRow(contentPadding = PaddingValues(horizontal = Space.edge), horizontalArrangement = Arrangement.spacedBy(Space.md)) {
                            items(page.similarArtists, key = { it.id.ifBlank { it.name } }) { a ->
                                ArtCard(a.name, "Artist", ArtworkUrls.sized(a.avatar, ArtworkUrls.Size.Card), onClick = { actions.openArtist(a.id, a.name) }, size = 112.dp, circle = true)
                            }
                        }
                    }
                }

                if (page.description.isNotBlank()) {
                    item(key = "about-h") { SectionHeader("About") }
                    item(key = "about") {
                        Text(page.description, style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.padding(horizontal = Space.edge), maxLines = 6, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }

        // Top bar fades in once the banner scrolls away.
        Box(Modifier.fillMaxWidth().background(color.mix(GT.Bg, 0.4f).copy(alpha = if (scrolled) 1f else 0f)).statusBarsPadding().height(56.dp)) {
            Row(Modifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { actions.nav.popBackStack() }) {
                    Box(Modifier.size(36.dp).clip(CircleShape).background(GT.Bg.copy(alpha = if (scrolled) 0f else 0.45f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = GT.Text)
                    }
                }
                AnimatedVisibility(scrolled, enter = fadeIn(), exit = fadeOut()) {
                    Text(page?.name ?: name, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.weight(1f))
                val tracks = page?.topTracks.orEmpty()
                AnimatedVisibility(scrolled && tracks.isNotEmpty(), enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
                    val playingHere = player.playWhenReady && tracks.any { it.id == player.current?.id }
                    PlayButton(playingHere, onClick = { if (playingHere) main.playback.togglePlay() else actions.play(tracks, 0, page?.name ?: name) }, size = 44.dp, modifier = Modifier.padding(end = Space.edge))
                }
            }
        }
    }
}
