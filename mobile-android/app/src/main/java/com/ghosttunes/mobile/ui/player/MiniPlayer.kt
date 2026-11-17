package com.ghosttunes.mobile.ui.player

import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.ui.MainViewModel
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.rememberArtColor
import com.ghosttunes.mobile.ui.components.rememberHaptics
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Motion
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
fun MiniPlayer(
    vm: MainViewModel,
    onExpand: () -> Unit,
    sharedScope: SharedTransitionScope,
    visibilityScope: AnimatedVisibilityScope,
    modifier: Modifier = Modifier,
) {
    val state by vm.player.collectAsState()
    val progress by vm.progress.collectAsState()
    val track = state.current ?: return
    val art = trackArtModel(track, ArtworkUrls.Size.Hero)
    val color by rememberArtColor(art)
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val offset = remember { Animatable(0f) }
    val threshold = with(LocalDensity.current) { 96.dp.toPx() }

    Box(
        modifier
            .fillMaxWidth()
            .height(Space.miniPlayer)
            .clip(RoundedCornerShape(Radii.hero))
            .background(color.mix(GT.Surface2, 0.45f))
            .clickable(onClickLabel = "Open Now Playing", onClick = onExpand)
            .pointerInput(track.id) {
                detectHorizontalDragGestures(
                    onDragEnd = {
                        scope.launch {
                            val v = offset.value
                            if (abs(v) > threshold) {
                                haptics.tick()
                                if (v < 0) vm.playback.next() else vm.playback.previous()
                            }
                            offset.animateTo(0f, Motion.gentle)
                        }
                    },
                    onDragCancel = { scope.launch { offset.animateTo(0f, Motion.gentle) } },
                ) { change, drag ->
                    change.consume()
                    scope.launch { offset.snapTo(offset.value + drag) }
                }
            },
    ) {
        Row(
            Modifier.fillMaxWidth().fillMaxHeight().padding(start = Space.xs, end = Space.xxs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            with(sharedScope) {
                Artwork(
                    art, null,
                    Modifier
                        .size(Space.rowArt)
                        .sharedElement(rememberSharedContentState("np-art"), visibilityScope),
                    shape = RoundedCornerShape(Radii.rowArt),
                )
            }
            Spacer(Modifier.width(Space.sm))
            Column(
                Modifier
                    .weight(1f)
                    .offset { IntOffset(offset.value.roundToInt(), 0) },
            ) {
                Text(
                    track.title, style = TypeScale.bodyLarge.copy(fontSize = TypeScale.body.fontSize), color = GT.Text,
                    maxLines = 1, modifier = Modifier.basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 2_000),
                )
                Text(track.artist, style = TypeScale.body.copy(fontSize = TypeScale.label.fontSize), color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(Modifier.size(Space.touch), contentAlignment = Alignment.Center) {
                if (state.isBuffering && state.playWhenReady) {
                    CircularProgressIndicator(Modifier.size(22.dp), color = GT.Text, strokeWidth = 2.dp)
                } else {
                    IconButton(onClick = { haptics.confirm(); vm.playback.togglePlay() }) {
                        Icon(
                            if (state.playWhenReady) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            if (state.playWhenReady) "Pause" else "Play", tint = GT.Text, modifier = Modifier.size(30.dp),
                        )
                    }
                }
            }
        }
        // 2dp progress line along the bottom edge.
        Box(
            Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = Space.xs)
                .fillMaxWidth()
                .height(2.dp)
                .clip(RoundedCornerShape(1.dp))
                .background(GT.Text.copy(alpha = 0.18f))
                .semantics { contentDescription = "Progress" },
        ) {
            Box(Modifier.fillMaxWidth(progress.fraction).fillMaxHeight().background(GT.Text))
        }
    }
}
