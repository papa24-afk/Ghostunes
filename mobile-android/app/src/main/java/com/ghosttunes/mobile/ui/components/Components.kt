package com.ghosttunes.mobile.ui.components

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DownloadDone
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import coil3.compose.SubcomposeAsyncImageContent
import coil3.compose.AsyncImagePainter
import com.ghosttunes.mobile.data.model.Track
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.download.DownloadFiles
import com.ghosttunes.mobile.handoff.HandoffStatus
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Motion
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale

// ---------------------------------------------------------------- haptics

class Haptics(private val view: android.view.View) {
    fun confirm() = view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)
    fun tick() = view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
    fun longPress() = view.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
}

@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    return remember(view) { Haptics(view) }
}

// ---------------------------------------------------------------- press scale

/** Spotify/Apple-style press feedback: scale to 0.96 with a spring, no ripple. */
fun Modifier.pressScale(interaction: MutableInteractionSource, pressed: Float = 0.96f): Modifier = composed {
    val isPressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (isPressed) pressed else 1f, Motion.press, label = "press")
    graphicsLayer { scaleX = scale; scaleY = scale }
}

@Composable
fun Modifier.pressable(onClick: () -> Unit, onLongClick: (() -> Unit)? = null, label: String? = null): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val haptics = rememberHaptics()
    return this
        .pressScale(interaction)
        .combinedClickable(
            interactionSource = interaction,
            indication = null,
            onClickLabel = label,
            onLongClick = onLongClick?.let { { haptics.longPress(); it() } },
            onClick = onClick,
        )
}

// ---------------------------------------------------------------- artwork

/** Model for a track's art: the downloaded file when offline-ready, else the right-sized URL. */
@Composable
fun trackArtModel(track: Track, size: ArtworkUrls.Size): Any {
    val context = LocalContext.current
    return remember(track.id, track.thumbnail, size) {
        DownloadFiles.localArt(context, track.id) ?: ArtworkUrls.sized(track.thumbnail, size)
    }
}

/** Fixed-size art: never shifts layout; fades in; falls back to hqdefault, then a quiet glyph. */
@Composable
fun Artwork(
    model: Any?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(Radii.rowArt),
) {
    Box(modifier.clip(shape).background(GT.Surface2)) {
        if (model == null || (model is String && model.isBlank())) {
            ArtGlyph()
        } else {
            SubcomposeAsyncImage(
                model = model,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            ) {
                val state by painter.state.collectAsState()
                when (state) {
                    is AsyncImagePainter.State.Error -> {
                        val fallback = (model as? String)?.let(ArtworkUrls::fallback)
                        if (fallback != null) Artwork(fallback, contentDescription, Modifier.fillMaxSize(), shape) else ArtGlyph()
                    }
                    is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
                    else -> Unit
                }
            }
        }
    }
}

@Composable
private fun ArtGlyph() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Icon(Icons.Rounded.MusicNote, null, tint = GT.TextTertiary, modifier = Modifier.size(20.dp))
    }
}

// ---------------------------------------------------------------- rows

@Composable
fun TrackRow(
    track: Track,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isCurrent: Boolean = false,
    isPlaying: Boolean = false,
    downloaded: Boolean = false,
    index: Int? = null,
    showArt: Boolean = true,
    subtitle: String = track.artist,
    onMore: (() -> Unit)? = null,
) {
    val haptics = rememberHaptics()
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = Space.row)
            .combinedClickable(onClick = onClick, onLongClick = onMore?.let { { haptics.longPress(); it() } })
            .padding(start = Space.edge, end = Space.xxs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (index != null) {
            Box(Modifier.width(28.dp), contentAlignment = Alignment.CenterStart) {
                if (isCurrent) EqualizerBars(animate = isPlaying)
                else Text("$index", style = TypeScale.tabular.copy(fontSize = TypeScale.body.fontSize), color = GT.TextSecondary)
            }
        }
        if (showArt) {
            Artwork(trackArtModel(track, ArtworkUrls.Size.Row), null, Modifier.size(Space.rowArt))
            Spacer(Modifier.width(Space.sm))
        }
        Column(Modifier.weight(1f).padding(vertical = Space.xs)) {
            Text(
                track.title,
                style = TypeScale.bodyLarge,
                color = if (isCurrent) GT.Accent else GT.Text,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (downloaded) {
                    Icon(Icons.Rounded.DownloadDone, "Downloaded", tint = GT.Accent, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(Space.xxs))
                }
                if (isCurrent && index == null) {
                    EqualizerBars(animate = isPlaying, height = 10.dp)
                    Spacer(Modifier.width(6.dp))
                }
                Text(subtitle, style = TypeScale.body, color = GT.TextSecondary, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (onMore != null) {
            IconButton(onClick = onMore) {
                Icon(Icons.Rounded.MoreVert, "More options for ${track.title}", tint = GT.TextSecondary)
            }
        } else {
            Spacer(Modifier.width(Space.sm))
        }
    }
}

/** Three bars for the playing row. */
@Composable
fun EqualizerBars(animate: Boolean, modifier: Modifier = Modifier, height: Dp = 14.dp, color: Color = GT.Accent) {
    val transition = rememberInfiniteTransition(label = "eq")
    val bars = listOf(420, 300, 520).map { ms ->
        if (animate) transition.animateFloat(0.25f, 1f, infiniteRepeatable(tween(ms, easing = LinearEasing), RepeatMode.Reverse), label = "bar").value
        else 0.35f
    }
    Row(modifier.height(height).semantics { contentDescription = "Now playing" }, horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.Bottom) {
        bars.forEach { f -> Box(Modifier.width(3.dp).fillMaxHeight(f).background(color, RoundedCornerShape(1.dp))) }
    }
}


// ---------------------------------------------------------------- headers, cards

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(start = Space.edge, end = Space.xs, top = Space.xl, bottom = Space.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = TypeScale.title, color = GT.Text, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (action != null && onAction != null) {
            Text(
                action,
                style = TypeScale.label,
                color = GT.TextSecondary,
                modifier = Modifier.clip(CircleShape).clickable(onClick = onAction).padding(horizontal = Space.xs, vertical = Space.sm),
            )
        }
    }
}

@Composable
fun ArtCard(
    title: String,
    subtitle: String,
    art: Any?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = Space.card,
    circle: Boolean = false,
    onLongClick: (() -> Unit)? = null,
) {
    Column(modifier.width(size).pressable(onClick, onLongClick, label = title)) {
        Artwork(
            art, null, Modifier.size(size),
            shape = if (circle) CircleShape else RoundedCornerShape(Radii.card),
        )
        Spacer(Modifier.height(Space.xs))
        Text(
            title, style = TypeScale.label.copy(fontSize = TypeScale.body.fontSize, lineHeight = TypeScale.body.lineHeight),
            color = GT.Text, maxLines = if (circle) 1 else 2, overflow = TextOverflow.Ellipsis,
            modifier = if (circle) Modifier.align(Alignment.CenterHorizontally) else Modifier,
        )
        if (subtitle.isNotBlank()) {
            Text(
                subtitle, style = TypeScale.label.copy(fontWeight = TypeScale.body.fontWeight), color = GT.TextSecondary,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = if (circle) Modifier.align(Alignment.CenterHorizontally) else Modifier,
            )
        }
    }
}

/** Big round accent play button (one per screen). */
@Composable
fun PlayButton(playing: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 56.dp) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = rememberHaptics()
    Box(
        modifier
            .size(size)
            .pressScale(interaction, 0.92f)
            .clip(CircleShape)
            .background(GT.Accent)
            .clickable(interactionSource = interaction, indication = null) { haptics.confirm(); onClick() }
            .semantics { contentDescription = if (playing) "Pause" else "Play" },
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(playing, transitionSpec = { (scaleIn() + fadeIn()) togetherWith (scaleOut() + fadeOut()) }, label = "play") { p ->
            Icon(if (p) Icons.Rounded.Pause else Icons.Rounded.PlayArrow, null, tint = GT.OnAccent, modifier = Modifier.size(size * 0.5f))
        }
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val bg by androidx.compose.animation.animateColorAsState(if (selected) GT.Accent else GT.Surface2, label = "chip")
    val fg by androidx.compose.animation.animateColorAsState(if (selected) GT.OnAccent else GT.Text, label = "chipText")
    Box(
        modifier
            .heightIn(min = 32.dp)
            .clip(CircleShape)
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = Space.md, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = TypeScale.label, color = fg, maxLines = 1) }
}

// ---------------------------------------------------------------- loading / error

@Composable
fun Modifier.shimmer(): Modifier {
    val t = rememberInfiniteTransition(label = "shimmer")
    val x by t.animateFloat(-1f, 2f, infiniteRepeatable(tween(1200, easing = LinearEasing)), label = "x")
    return background(
        Brush.linearGradient(
            listOf(GT.Surface2, GT.Surface3, GT.Surface2),
            start = androidx.compose.ui.geometry.Offset(x * 600f, 0f),
            end = androidx.compose.ui.geometry.Offset(x * 600f + 400f, 200f),
        )
    )
}

@Composable
fun RowSkeleton(showArt: Boolean = true) {
    Row(Modifier.fillMaxWidth().height(Space.row).padding(horizontal = Space.edge), verticalAlignment = Alignment.CenterVertically) {
        if (showArt) {
            Box(Modifier.size(Space.rowArt).clip(RoundedCornerShape(Radii.rowArt)).shimmer())
            Spacer(Modifier.width(Space.sm))
        }
        Column(Modifier.weight(1f)) {
            Box(Modifier.fillMaxWidth(0.62f).height(12.dp).clip(RoundedCornerShape(3.dp)).shimmer())
            Spacer(Modifier.height(Space.xs))
            Box(Modifier.fillMaxWidth(0.38f).height(10.dp).clip(RoundedCornerShape(3.dp)).shimmer())
        }
    }
}

@Composable
fun CardSkeleton(size: Dp = Space.card, circle: Boolean = false) {
    Column(Modifier.width(size)) {
        Box(Modifier.size(size).clip(if (circle) CircleShape else RoundedCornerShape(Radii.card)).shimmer())
        Spacer(Modifier.height(Space.xs))
        Box(Modifier.fillMaxWidth(0.8f).height(12.dp).clip(RoundedCornerShape(3.dp)).shimmer())
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth(0.5f).height(10.dp).clip(RoundedCornerShape(3.dp)).shimmer())
    }
}

@Composable
fun ErrorState(message: String, onRetry: (() -> Unit)?, modifier: Modifier = Modifier, title: String = "Couldn't load this") {
    Column(
        modifier.fillMaxWidth().padding(horizontal = Space.xl, vertical = Space.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, style = TypeScale.title, color = GT.Text)
        Spacer(Modifier.height(Space.xs))
        Text(message, style = TypeScale.body, color = GT.TextSecondary, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (onRetry != null) {
            Spacer(Modifier.height(Space.lg))
            Row(
                Modifier.clip(CircleShape).background(GT.Text).clickable(onClick = onRetry).padding(horizontal = Space.lg, vertical = Space.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Rounded.Refresh, null, tint = GT.Bg, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(Space.xs))
                Text("Try again", style = TypeScale.label, color = GT.Bg)
            }
        }
    }
}

/** Light pill button (secondary actions). */
@Composable
fun PillButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, filled: Boolean = false, enabled: Boolean = true) {
    Box(
        modifier
            .heightIn(min = Space.touch)
            .clip(CircleShape)
            .background(if (filled) GT.Text else Color.Transparent)
            .then(if (filled) Modifier else Modifier.border(1.dp, GT.TextTertiary, CircleShape))
            .clickable(enabled = enabled, onClick = onClick)
            .graphicsLayer { alpha = if (enabled) 1f else 0.4f }
            .padding(horizontal = Space.lg),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = TypeScale.label.copy(fontSize = TypeScale.body.fontSize), color = if (filled) GT.Bg else GT.Text) }
}


// ---------------------------------------------------------------- handoff pill

/** "Sending to PC…" → "Now playing on your PC". Top-center, animated. */
@Composable
fun HandoffPill(status: HandoffStatus?, modifier: Modifier = Modifier) {
    AnimatedVisibility(
        visible = status != null,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
        modifier = modifier,
    ) {
        val s = status ?: return@AnimatedVisibility
        val dot = when (s) {
            is HandoffStatus.Done -> GT.Success
            is HandoffStatus.Failed -> GT.Error
            is HandoffStatus.Working -> GT.Accent
        }
        Row(
            Modifier
                .padding(top = Space.xs)
                .widthIn(max = 360.dp)
                .clip(CircleShape)
                .background(GT.Surface3)
                .padding(horizontal = Space.md, vertical = 10.dp)
                .semantics { contentDescription = s.message },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val pulse = rememberInfiniteTransition(label = "pulse")
            val a by pulse.animateFloat(0.35f, 1f, infiniteRepeatable(tween(600), RepeatMode.Reverse), label = "a")
            Box(Modifier.size(8.dp).graphicsLayer { alpha = if (s.terminal) 1f else a }.clip(CircleShape).background(dot))
            Spacer(Modifier.width(Space.xs + 2.dp))
            AnimatedContent(s.message, label = "msg") { msg ->
                Text(msg, style = TypeScale.label.copy(fontSize = TypeScale.body.fontSize), color = GT.Text, maxLines = 2)
            }
        }
    }
}
