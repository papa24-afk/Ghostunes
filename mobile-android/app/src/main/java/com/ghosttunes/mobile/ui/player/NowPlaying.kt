package com.ghosttunes.mobile.ui.player

import androidx.activity.compose.PredictiveBackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.playback.Progress
import com.ghosttunes.mobile.playback.SleepTimerState
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.MainViewModel
import com.ghosttunes.mobile.ui.components.Artwork
import com.ghosttunes.mobile.ui.components.PlayButton
import com.ghosttunes.mobile.ui.components.mix
import com.ghosttunes.mobile.ui.components.rememberArtColor
import com.ghosttunes.mobile.ui.components.rememberHaptics
import com.ghosttunes.mobile.ui.components.trackArtModel
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Motion
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

fun formatTime(ms: Long): String {
    val total = (ms.coerceAtLeast(0) / 1000).toInt()
    return "%d:%02d".format(total / 60, total % 60)
}

@Composable
fun NowPlaying(
    vm: MainViewModel,
    onCollapse: () -> Unit,
    sharedScope: SharedTransitionScope,
    visibilityScope: AnimatedVisibilityScope,
) {
    val state by vm.player.collectAsState()
    val progress by vm.progress.collectAsState()
    val liked by vm.likedIds.collectAsState()
    val from by vm.playingFrom.collectAsState()
    val sleep by vm.sleepTimer.collectAsState()
    val track = state.current ?: return
    val actions = LocalActions.current
    val haptics = rememberHaptics()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current

    val art = trackArtModel(track, ArtworkUrls.Size.Hero)
    val color by rememberArtColor(art)

    var sheet by remember { mutableStateOf<String?>(null) } // queue | sleep | device
    var showLyrics by remember { mutableStateOf(false) }
    val lyrics = rememberLyrics(vm, track)

    // Drag down to collapse; predictive back drives the same motion.
    val dragY = remember { Animatable(0f) }
    var backProgress by remember { mutableFloatStateOf(0f) }
    PredictiveBackHandler(enabled = !showLyrics && sheet == null) { events ->
        try {
            events.collect { backProgress = it.progress }
            onCollapse()
        } catch (e: CancellationException) {
            backProgress = 0f
        }
    }
    val collapseThreshold = with(density) { 160.dp.toPx() }

    Box(
        Modifier
            .fillMaxSize()
            .graphicsLayer {
                translationY = dragY.value + backProgress * 64.dp.toPx()
                val s = 1f - backProgress * 0.06f
                scaleX = s; scaleY = s
                shape = RoundedCornerShape((backProgress * 28).dp)
                clip = backProgress > 0f || dragY.value > 0f
            }
            .background(Brush.verticalGradient(0f to color, 0.55f to color.mix(GT.Bg, 0.55f), 1f to GT.Bg)),
    ) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val screenH = maxHeight
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Column(
                    Modifier
                        .heightIn(min = screenH)
                        .statusBarsPadding()
                        .navigationBarsPadding()
                        .padding(horizontal = Space.lg),
                ) {
                    // Header
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(56.dp)
                            .draggable(
                                orientation = Orientation.Vertical,
                                state = rememberDraggableState { d -> scope.launch { dragY.snapTo((dragY.value + d).coerceAtLeast(0f)) } },
                                onDragStopped = { v ->
                                    if (dragY.value > collapseThreshold || v > 1800f) onCollapse()
                                    dragY.animateTo(0f, Motion.gentle)
                                },
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onCollapse) { Icon(Icons.Rounded.KeyboardArrowDown, "Close Now Playing", tint = GT.Text, modifier = Modifier.size(30.dp)) }
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("PLAYING FROM", style = TypeScale.caption.copy(letterSpacing = TypeScale.caption.letterSpacing * 4), color = GT.TextSecondary, maxLines = 1)
                            Text(from.ifBlank { "Your queue" }, style = TypeScale.label, color = GT.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        IconButton(onClick = { actions.trackMenu(track) }) { Icon(Icons.Rounded.MoreVert, "More options", tint = GT.Text) }
                    }

                    Spacer(Modifier.weight(1f))

                    // Art: shrinks when paused, swipe to skip, drag down to close.
                    val artScale by animateFloatAsState(if (state.playWhenReady) 1f else 0.86f, Motion.artPause, label = "artScale")
                    var direction by remember { mutableIntStateOf(1) }
                    val swipe = remember { Animatable(0f) }
                    val swipeThreshold = with(density) { 90.dp.toPx() }
                    with(sharedScope) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .sharedElement(rememberSharedContentState("np-art"), visibilityScope)
                                .draggable(
                                    orientation = Orientation.Vertical,
                                    state = rememberDraggableState { d -> scope.launch { dragY.snapTo((dragY.value + d).coerceAtLeast(0f)) } },
                                    onDragStopped = { v ->
                                        if (dragY.value > collapseThreshold || v > 1800f) onCollapse()
                                        dragY.animateTo(0f, Motion.gentle)
                                    },
                                )
                                .pointerInput(track.id) {
                                    detectHorizontalDragGestures(
                                        onDragEnd = {
                                            scope.launch {
                                                val v = swipe.value
                                                if (abs(v) > swipeThreshold) {
                                                    haptics.tick()
                                                    direction = if (v < 0) 1 else -1
                                                    if (v < 0) vm.playback.next() else vm.playback.previous()
                                                }
                                                swipe.animateTo(0f, Motion.gentle)
                                            }
                                        },
                                    ) { change, d -> change.consume(); scope.launch { swipe.snapTo(swipe.value + d) } }
                                }
                                .graphicsLayer {
                                    scaleX = artScale; scaleY = artScale
                                    translationX = swipe.value
                                    rotationZ = swipe.value / 80f
                                },
                        ) {
                            AnimatedContent(
                                targetState = track.id to art,
                                transitionSpec = {
                                    (slideInHorizontally(tween(280)) { it * direction / 2 } + fadeIn(tween(220))) togetherWith
                                        (slideOutHorizontally(tween(280)) { -it * direction / 2 } + fadeOut(tween(180)))
                                },
                                label = "art",
                            ) { (_, model) ->
                                Artwork(model, "Album art for ${track.title}", Modifier.fillMaxSize(), RoundedCornerShape(Radii.hero))
                            }
                        }
                    }

                    Spacer(Modifier.weight(1f))
                    Spacer(Modifier.height(Space.lg))

                    // Title, artist, like
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                track.title, style = TypeScale.nowPlayingTitle, color = GT.Text, maxLines = 1,
                                modifier = Modifier.basicMarquee(iterations = Int.MAX_VALUE, initialDelayMillis = 2_500),
                            )
                            Text(
                                track.artist, style = TypeScale.bodyLarge.copy(fontWeight = TypeScale.body.fontWeight), color = GT.TextSecondary,
                                maxLines = 1, overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.clickable(onClickLabel = "Open artist") {
                                    actions.openArtist(track.artistId ?: "", track.artist.substringBefore(",").trim())
                                },
                            )
                        }
                        val isLiked = track.id in liked
                        val likeScale = remember { Animatable(1f) }
                        IconButton(onClick = {
                            haptics.confirm()
                            vm.toggleLike(track)
                            scope.launch { likeScale.snapTo(0.7f); likeScale.animateTo(1f, Motion.press) }
                        }) {
                            Icon(
                                if (isLiked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                                if (isLiked) "Remove from Liked Songs" else "Add to Liked Songs",
                                tint = if (isLiked) GT.Accent else GT.Text,
                                modifier = Modifier.size(28.dp).graphicsLayer { scaleX = likeScale.value; scaleY = likeScale.value },
                            )
                        }
                    }

                    Spacer(Modifier.height(Space.md))
                    Scrubber(progress, onSeek = { vm.playback.seekTo(it) })

                    // Transport
                    Row(
                        Modifier.fillMaxWidth().padding(top = Space.xs),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = { haptics.tick(); vm.playback.toggleShuffle() }) {
                            ActiveIcon(Icons.Rounded.Shuffle, if (state.shuffle) "Shuffle on" else "Shuffle off", state.shuffle)
                        }
                        IconButton(onClick = { haptics.tick(); direction = -1; vm.playback.previous() }, Modifier.size(56.dp)) {
                            Icon(Icons.Rounded.SkipPrevious, "Previous", tint = GT.Text, modifier = Modifier.size(40.dp))
                        }
                        PlayButton(state.playWhenReady, onClick = { vm.playback.togglePlay() }, size = 68.dp)
                        IconButton(onClick = { haptics.tick(); direction = 1; vm.playback.next() }, Modifier.size(56.dp), enabled = state.upNext.isNotEmpty()) {
                            Icon(Icons.Rounded.SkipNext, "Next", tint = if (state.upNext.isNotEmpty()) GT.Text else GT.TextTertiary, modifier = Modifier.size(40.dp))
                        }
                        IconButton(onClick = { haptics.tick(); vm.playback.cycleRepeat() }) {
                            val mode = state.repeatMode
                            ActiveIcon(
                                if (mode == androidx.media3.common.Player.REPEAT_MODE_ONE) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                                when (mode) { androidx.media3.common.Player.REPEAT_MODE_ONE -> "Repeat one"; androidx.media3.common.Player.REPEAT_MODE_ALL -> "Repeat all"; else -> "Repeat off" },
                                mode != androidx.media3.common.Player.REPEAT_MODE_OFF,
                            )
                        }
                    }

                    state.error?.let { err ->
                        Row(
                            Modifier.fillMaxWidth().padding(top = Space.sm).clip(RoundedCornerShape(Radii.hero)).background(GT.Bg.copy(alpha = 0.5f))
                                .clickable { vm.playback.retry() }.padding(Space.sm),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(err, style = TypeScale.body, color = GT.Text, modifier = Modifier.weight(1f))
                            Text("Retry", style = TypeScale.label, color = GT.Accent, modifier = Modifier.padding(start = Space.sm))
                        }
                    }

                    // Device / share / timer / queue
                    Row(
                        Modifier.fillMaxWidth().padding(top = Space.sm, bottom = Space.xs),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Row(
                            Modifier.clip(CircleShape).clickable(onClickLabel = "Choose device") { sheet = "device" }.padding(end = Space.sm),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.size(Space.touch), contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.Devices, null, tint = GT.Accent, modifier = Modifier.size(22.dp))
                            }
                            Text("This phone", style = TypeScale.label, color = GT.Accent)
                        }
                        Spacer(Modifier.weight(1f))
                        IconButton(onClick = { vm.share(track) }) { Icon(Icons.Rounded.Share, "Share", tint = GT.Text, modifier = Modifier.size(22.dp)) }
                        IconButton(onClick = { sheet = "sleep" }) {
                            Icon(Icons.Rounded.Bedtime, if (sleep is SleepTimerState.Off) "Sleep timer" else "Sleep timer on", tint = if (sleep is SleepTimerState.Off) GT.Text else GT.Accent, modifier = Modifier.size(22.dp))
                        }
                        IconButton(onClick = { sheet = "queue" }) { Icon(Icons.Rounded.QueueMusic, "Queue", tint = GT.Text, modifier = Modifier.size(24.dp)) }
                    }
                }

                // Lyrics card (scroll down to reach it, like Spotify)
                LyricsCard(lyrics, progress.positionMs, color, onOpen = { showLyrics = true })
                Spacer(Modifier.navigationBarsPadding().height(Space.xl))
            }
        }

        AnimatedVisibility(
            visible = showLyrics,
            enter = slideInVertically(tween(300)) { it / 4 } + fadeIn(tween(220)),
            exit = slideOutVertically(tween(240)) { it / 4 } + fadeOut(tween(180)),
        ) {
            LyricsScreen(vm, track, lyrics, color, onClose = { showLyrics = false })
        }
    }

    when (sheet) {
        "queue" -> QueueSheet(vm, onDismiss = { sheet = null })
        "sleep" -> SleepSheet(vm, onDismiss = { sheet = null })
        "device" -> DeviceSheet(vm, onDismiss = { sheet = null })
    }
}

@Composable
private fun ActiveIcon(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, active: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, description, tint = if (active) GT.Accent else GT.Text, modifier = Modifier.size(24.dp))
        Box(Modifier.padding(top = 2.dp).size(4.dp).clip(CircleShape).background(if (active) GT.Accent else androidx.compose.ui.graphics.Color.Transparent))
    }
}

/** Thin scrubber with elapsed / remaining in tabular figures. Thumb grows while dragging. */
@Composable
fun Scrubber(progress: Progress, onSeek: (Long) -> Unit, modifier: Modifier = Modifier) {
    val haptics = rememberHaptics()
    var dragging by remember { mutableStateOf(false) }
    var dragFraction by remember { mutableFloatStateOf(0f) }
    val fraction = if (dragging) dragFraction else progress.fraction
    val buffered = if (progress.durationMs > 0) (progress.bufferedMs.toFloat() / progress.durationMs).coerceIn(0f, 1f) else 0f
    val thumb by animateFloatAsState(if (dragging) 8f else 6f, Motion.press, label = "thumb")
    val duration = progress.durationMs

    Column(modifier) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(28.dp)
                .semantics {
                    contentDescription = "Seek bar"
                    progressBarRangeInfo = ProgressBarRangeInfo(fraction, 0f..1f)
                    setProgress { v -> onSeek((v * duration).toLong()); true }
                }
                .pointerInput(duration) {
                    detectTapGestures { o -> if (duration > 0) onSeek((o.x / size.width * duration).toLong()) }
                }
                .pointerInput(duration) {
                    detectHorizontalDragGestures(
                        onDragStart = { o -> dragging = true; dragFraction = (o.x / size.width).coerceIn(0f, 1f); haptics.tick() },
                        onDragEnd = { if (duration > 0) onSeek((dragFraction * duration).toLong()); dragging = false },
                        onDragCancel = { dragging = false },
                    ) { change, _ -> change.consume(); dragFraction = (change.position.x / size.width).coerceIn(0f, 1f) }
                },
        ) {
            val y = size.height / 2
            val h = 4.dp.toPx()
            val r = CornerRadius(h / 2)
            drawRoundRect(GT.Text.copy(alpha = 0.18f), Offset(0f, y - h / 2), Size(size.width, h), r)
            drawRoundRect(GT.Text.copy(alpha = 0.28f), Offset(0f, y - h / 2), Size(size.width * buffered, h), r)
            drawRoundRect(GT.Text, Offset(0f, y - h / 2), Size(size.width * fraction, h), r)
            drawCircle(GT.Text, thumb.dp.toPx(), Offset(size.width * fraction, y))
        }
        Row(Modifier.fillMaxWidth()) {
            val pos = (fraction * duration).toLong()
            Text(formatTime(pos), style = TypeScale.tabular, color = GT.TextSecondary)
            Spacer(Modifier.weight(1f))
            Text(if (duration > 0) "-" + formatTime(duration - pos) else "--:--", style = TypeScale.tabular, color = GT.TextSecondary, textAlign = TextAlign.End)
        }
    }
}
