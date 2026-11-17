package com.ghosttunes.mobile.ui.player

import androidx.activity.compose.BackHandler
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.ui.MainViewModel
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.shimmer
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale

sealed interface LyricsUi {
    data object Loading : LyricsUi
    data class Synced(val lines: List<LyricLine>) : LyricsUi
    data class Plain(val text: String) : LyricsUi
    data object Instrumental : LyricsUi
    data object None : LyricsUi
}

@Composable
fun rememberLyrics(vm: MainViewModel, track: Track): LyricsUi {
    val state by produceState<LyricsUi>(LyricsUi.Loading, track.id) {
        value = LyricsUi.Loading
        vm.lyricsFlow(track).collect { result ->
            val l = result.getOrNull()
            value = when {
                l == null -> LyricsUi.None
                l.instrumental -> LyricsUi.Instrumental
                Lrc.parse(l.syncedLyrics).isNotEmpty() -> LyricsUi.Synced(Lrc.parse(l.syncedLyrics).filter { it.text.isNotBlank() })
                !l.plainLyrics.isNullOrBlank() -> LyricsUi.Plain(l.plainLyrics)
                else -> LyricsUi.None
            }
        }
    }
    return state
}

/** Preview card under the controls. */
@Composable
fun LyricsCard(lyrics: LyricsUi, positionMs: Long, color: Color, onOpen: () -> Unit) {
    if (lyrics is LyricsUi.None) return
    Column(
        Modifier
            .padding(horizontal = Space.lg)
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radii.sheet))
            .background(color.mix(GT.Bg, 0.25f))
            .clickable(enabled = lyrics is LyricsUi.Synced || lyrics is LyricsUi.Plain, onClickLabel = "Open lyrics", onClick = onOpen)
            .padding(Space.md),
    ) {
        Text("Lyrics", style = TypeScale.bodyLarge, color = GT.Text)
        Spacer(Modifier.height(Space.sm))
        when (lyrics) {
            LyricsUi.Loading -> repeat(4) {
                Box(Modifier.fillMaxWidth(if (it % 2 == 0) 0.85f else 0.6f).height(18.dp).clip(RoundedCornerShape(4.dp)).shimmer())
                Spacer(Modifier.height(Space.xs))
            }
            LyricsUi.Instrumental -> Text("Instrumental", style = TypeScale.title, color = GT.TextSecondary)
            is LyricsUi.Plain -> Text(lyrics.text.lines().filter { it.isNotBlank() }.take(5).joinToString("\n"), style = TypeScale.title, color = GT.Text, maxLines = 5, overflow = TextOverflow.Ellipsis)
            is LyricsUi.Synced -> {
                val active = Lrc.activeIndex(lyrics.lines, positionMs).coerceAtLeast(0)
                val start = (active - 1).coerceAtLeast(0)
                lyrics.lines.drop(start).take(5).forEachIndexed { i, line ->
                    Text(
                        line.text, style = TypeScale.title,
                        color = if (start + i == active) GT.Text else GT.Text.copy(alpha = 0.45f),
                        maxLines = 2, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(vertical = 2.dp),
                    )
                }
            }
            LyricsUi.None -> Unit
        }
    }
}

/** Full-screen synced lyrics: auto-scrolls, active line in white, tap a line to seek. */
@Composable
fun LyricsScreen(vm: MainViewModel, track: Track, lyrics: LyricsUi, color: Color, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val progress by vm.progress.collectAsState()
    val list = rememberLazyListState()
    val topOffset = with(LocalDensity.current) { (LocalConfiguration.current.screenHeightDp * 0.28f).dp.roundToPx() }
    var lastUserScroll by remember { androidx.compose.runtime.mutableLongStateOf(0L) }

    LaunchedEffect(list) {
        list.interactionSource.interactions.collect { if (it is DragInteraction.Start || it is DragInteraction.Stop) lastUserScroll = System.currentTimeMillis() }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(0f to color, 1f to color.mix(GT.Bg, 0.6f)))
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.xs), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose) { Icon(Icons.Rounded.KeyboardArrowDown, "Close lyrics", tint = GT.Text, modifier = Modifier.size(30.dp)) }
            Column(Modifier.weight(1f).padding(end = Space.touch), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(track.title, style = TypeScale.label, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(track.artist, style = TypeScale.caption, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }

        Box(Modifier.weight(1f)) {
            when (lyrics) {
                is LyricsUi.Synced -> {
                    val active = Lrc.activeIndex(lyrics.lines, progress.positionMs + 150)
                    LaunchedEffect(active) {
                        if (active >= 0 && System.currentTimeMillis() - lastUserScroll > 4_000) {
                            list.animateScrollToItem(active, -topOffset)
                        }
                    }
                    LazyColumn(state = list, contentPadding = PaddingValues(start = Space.lg, end = Space.lg, top = Space.lg, bottom = 320.dp)) {
                        itemsIndexed(lyrics.lines, key = { i, l -> "${l.timeMs}-$i" }) { i, line ->
                            val c by animateColorAsState(
                                when {
                                    i == active -> GT.Text
                                    i < active -> GT.Text.copy(alpha = 0.55f)
                                    else -> GT.Text.copy(alpha = 0.32f)
                                },
                                tween(300), label = "line",
                            )
                            Text(
                                line.text, style = TypeScale.lyric, color = c,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(Radii.hero))
                                    .clickable(onClickLabel = "Play from this line") { vm.playback.seekTo(line.timeMs); lastUserScroll = 0 }
                                    .padding(vertical = Space.xs),
                            )
                        }
                    }
                }
                is LyricsUi.Plain -> Text(
                    lyrics.text, style = TypeScale.title.copy(lineHeight = TypeScale.lyric.lineHeight), color = GT.Text,
                    modifier = Modifier.verticalScroll(rememberScrollState()).padding(Space.lg),
                )
                else -> Unit
            }
        }
        Scrubber(progress, onSeek = { vm.playback.seekTo(it) }, modifier = Modifier.padding(horizontal = Space.lg, vertical = Space.xs))
    }
}
