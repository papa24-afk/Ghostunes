package com.ghosttunes.mobile.ui.collection

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.MainViewModel
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.ErrorState
import com.ghosttunes.mobile.ui.components.PlayButton
import com.ghosttunes.mobile.ui.components.RowSkeleton
import com.ghosttunes.mobile.ui.components.TrackRow
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.rememberArtColor
import com.ghosttunes.mobile.ui.components.rememberHaptics
import com.ghosttunes.mobile.ui.components.shimmer
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import kotlin.math.min

data class CollectionHeader(
    val title: String,
    val subtitle: String = "",
    val meta: String = "",
    val art: Any? = null,
    val artShape: Shape = RoundedCornerShape(Radii.hero),
    val onSubtitleClick: (() -> Unit)? = null,
    /** Square tile drawn instead of art (Liked Songs, Downloads). */
    val glyph: (@Composable () -> Unit)? = null,
)

/**
 * Album / playlist / list pages: palette-tinted header whose art shrinks and fades as you scroll,
 * a top bar that fades in with the title, and a Play button that sticks to it.
 */
@Composable
fun CollectionScaffold(
    header: CollectionHeader?,
    tracks: List<Track>,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    from: String,
    numbered: Boolean = false,
    showArt: Boolean = true,
    playlistId: Long? = null,
    emptyTitle: String = "Nothing here yet",
    emptyMessage: String = "",
    onMore: (() -> Unit)? = null,
    extraContent: (LazyListScope.() -> Unit)? = null,
) {
    val main: MainViewModel = com.ghosttunes.mobile.ui.LocalMainVm.current
    val actions = LocalActions.current
    val player by main.player.collectAsState()
    val downloads by main.downloadStates.collectAsState()
    val bottom = LocalBottomPadding.current
    val list = rememberLazyListState()
    val density = LocalDensity.current
    val haptics = rememberHaptics()
    val color by rememberArtColor(header?.art, fallback = GT.Surface3)

    val headerHeightPx = with(density) { 300.dp.toPx() }
    val collapse by remember { derivedStateOf { if (list.firstVisibleItemIndex > 0) 1f else min(1f, list.firstVisibleItemScrollOffset / headerHeightPx) } }
    val stickyPlay by remember { derivedStateOf { list.firstVisibleItemIndex >= 2 } }
    val playingHere = player.current != null && tracks.any { it.id == player.current?.id } && player.playWhenReady
    val allDownloaded = tracks.isNotEmpty() && tracks.all { downloads[it.id]?.state == DownloadRepository.STATE_DONE }

    val playAll: () -> Unit = {
        if (playingHere) main.playback.togglePlay() else actions.play(tracks, 0, from)
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(state = list, modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = bottom)) {
            item(key = "header") {
                Box(Modifier.fillMaxWidth().background(Brush.verticalGradient(0f to color, 1f to GT.Bg))) {
                    Column(
                        Modifier.fillMaxWidth().statusBarsPadding().padding(top = 56.dp, start = Space.edge, end = Space.edge, bottom = Space.md),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        val artMod = Modifier
                            .size(232.dp)
                            .graphicsLayer {
                                val s = 1f - collapse * 0.25f
                                scaleX = s; scaleY = s
                                alpha = 1f - collapse
                                translationY = collapse * 60f
                            }
                        when {
                            header == null -> Box(artMod.clip(RoundedCornerShape(Radii.hero)).shimmer())
                            header.glyph != null -> Box(artMod.clip(RoundedCornerShape(Radii.hero))) { header.glyph.invoke() }
                            else -> Artwork(header.art, null, artMod, header.artShape)
                        }
                        Spacer(Modifier.height(Space.lg))
                        Column(Modifier.fillMaxWidth()) {
                            if (header == null) {
                                Box(Modifier.fillMaxWidth(0.7f).height(28.dp).clip(RoundedCornerShape(4.dp)).shimmer())
                                Spacer(Modifier.height(Space.xs))
                                Box(Modifier.fillMaxWidth(0.4f).height(14.dp).clip(RoundedCornerShape(4.dp)).shimmer())
                            } else {
                                Text(header.title, style = TypeScale.headline, color = GT.Text, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                if (header.subtitle.isNotBlank()) {
                                    Spacer(Modifier.height(Space.xxs))
                                    Text(
                                        header.subtitle, style = TypeScale.bodyLarge, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        modifier = header.onSubtitleClick?.let { Modifier.clickable(onClick = it) } ?: Modifier,
                                    )
                                }
                                if (header.meta.isNotBlank()) {
                                    Spacer(Modifier.height(Space.xxs))
                                    Text(header.meta, style = TypeScale.label.copy(fontWeight = TypeScale.body.fontWeight), color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
            }

            item(key = "actions") {
                Row(Modifier.fillMaxWidth().padding(start = Space.xs, end = Space.edge, bottom = Space.xs), verticalAlignment = Alignment.CenterVertically) {
                    if (tracks.isNotEmpty()) {
                        IconButton(onClick = {
                            haptics.confirm()
                            if (allDownloaded) actions.snack("All songs are downloaded") else actions.download(tracks)
                        }) {
                            Icon(
                                if (allDownloaded) Icons.Rounded.DownloadDone else Icons.Rounded.Download,
                                if (allDownloaded) "Downloaded" else "Download all",
                                tint = if (allDownloaded) GT.Accent else GT.TextSecondary,
                            )
                        }
                        IconButton(onClick = { actions.addToQueue(tracks) }) { Icon(Icons.AutoMirrored.Rounded.QueueMusic, "Add all to queue", tint = GT.TextSecondary) }
                    }
                    if (onMore != null) IconButton(onClick = onMore) { Icon(Icons.Rounded.MoreVert, "More options", tint = GT.TextSecondary) }
                    Spacer(Modifier.weight(1f))
                    if (tracks.isNotEmpty()) {
                        IconButton(onClick = { haptics.tick(); actions.play(tracks, 0, from, shuffle = true) }) {
                            Icon(Icons.Rounded.Shuffle, "Shuffle play", tint = GT.Text)
                        }
                        Spacer(Modifier.width(Space.xs))
                        PlayButton(playingHere, onClick = playAll)
                    }
                }
            }

            when {
                loading && tracks.isEmpty() -> items(8) { RowSkeleton(showArt) }
                error != null && tracks.isEmpty() -> item(key = "error") { ErrorState(error, onRetry) }
                tracks.isEmpty() -> item(key = "empty") { ErrorState(emptyMessage, null, title = emptyTitle) }
                else -> itemsIndexed(tracks, key = { i, t -> "${t.id}-$i" }) { i, t ->
                    SwipeRow(t, onQueue = { actions.addToQueue(listOf(t)) }, onLike = { actions.toggleLike(t) }) {
                        TrackRow(
                            t,
                            onClick = { actions.play(tracks, i, from) },
                            isCurrent = player.current?.id == t.id,
                            isPlaying = player.isPlaying,
                            downloaded = downloads[t.id]?.state == DownloadRepository.STATE_DONE,
                            index = if (numbered) i + 1 else null,
                            showArt = showArt,
                            onMore = { actions.trackMenu(t, playlistId) },
                        )
                    }
                }
            }
            extraContent?.invoke(this)
        }

        // Top bar: fades in with the title; Play sticks here once the actions row scrolls away.
        Box(
            Modifier
                .fillMaxWidth()
                .background(color.mix(GT.Bg, 0.35f).copy(alpha = collapse))
                .statusBarsPadding()
                .height(56.dp),
        ) {
            Row(Modifier.fillMaxSize().padding(end = Space.edge), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { actions.nav.popBackStack() }) {
                    Box(Modifier.size(36.dp).clip(CircleShape).background(GT.Bg.copy(alpha = 0.45f * (1f - collapse))), contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = GT.Text)
                    }
                }
                Text(
                    header?.title.orEmpty(), style = TypeScale.bodyLarge, color = GT.Text.copy(alpha = collapse), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                AnimatedVisibility(stickyPlay && tracks.isNotEmpty(), enter = scaleIn() + fadeIn(), exit = scaleOut() + fadeOut()) {
                    PlayButton(playingHere, onClick = playAll, size = 44.dp)
                }
            }
        }
    }
}

/** Swipe right: add to queue. Swipe left: like. Snaps back either way. */
@Composable
fun SwipeRow(track: Track, onQueue: () -> Unit, onLike: () -> Unit, content: @Composable () -> Unit) {
    val haptics = rememberHaptics()
    val state = rememberSwipeToDismissBoxState(
        confirmValueChange = { v ->
            when (v) {
                SwipeToDismissBoxValue.StartToEnd -> { haptics.confirm(); onQueue() }
                SwipeToDismissBoxValue.EndToStart -> { haptics.confirm(); onLike() }
                else -> Unit
            }
            false
        },
        positionalThreshold = { it * 0.35f },
    )
    SwipeToDismissBox(
        state,
        backgroundContent = {
            val toQueue = state.dismissDirection == SwipeToDismissBoxValue.StartToEnd
            Row(
                Modifier.fillMaxSize().background(if (toQueue) GT.Surface3 else GT.Accent.mix(GT.Bg, 0.55f)).padding(horizontal = Space.lg),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = if (toQueue) Arrangement.Start else Arrangement.End,
            ) {
                Icon(if (toQueue) Icons.AutoMirrored.Rounded.QueueMusic else Icons.Rounded.Favorite, null, tint = GT.Text)
                Spacer(Modifier.width(Space.xs))
                Text(if (toQueue) "Add to queue" else "Like", style = TypeScale.label, color = GT.Text)
            }
        },
    ) { Box(Modifier.background(GT.Bg)) { content() } }
}

/** Glyph tile for Liked Songs / Downloads covers (no fake art). */
@Composable
fun GlyphTile(icon: androidx.compose.ui.graphics.vector.ImageVector, size: Dp = 232.dp) {
    Box(Modifier.size(size).background(GT.Accent.mix(GT.Bg, 0.35f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = GT.Text, modifier = Modifier.size(size * 0.36f))
    }
}
