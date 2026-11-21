package com.ghosttunes.mobile.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.ghosttunes.mobile.data.net.ArtworkUrls
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.TypeScale
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The "throw it to the PC" moment: the album art lifts off and flies toward the PC with a glow
 * (or drops in from the PC when music comes back). Drawn over whatever screen is showing.
 */
@Composable
fun TransferOverlay(coordinator: HandoffCoordinator) {
    var event by remember { mutableStateOf<HandoffCoordinator.Transfer?>(null) }
    LaunchedEffect(coordinator) { coordinator.transfers.collect { event = it } }
    val e = event ?: return

    val art = trackArtModel(e.track, ArtworkUrls.Size.Hero)
    val color by rememberArtColor(art)
    val scrim = remember(e) { Animatable(0f) }
    val y = remember(e) { Animatable(if (e is HandoffCoordinator.Transfer.ToPhone) -1f else 0f) }
    val scale = remember(e) { Animatable(if (e is HandoffCoordinator.Transfer.ToPhone) 0.55f else 0.92f) }
    val artAlpha = remember(e) { Animatable(0f) }
    val tilt = remember(e) { Animatable(0f) }
    val ring = remember(e) { Animatable(0f) }
    val label = remember(e) { Animatable(0f) }

    LaunchedEffect(e) {
        coroutineScope {
            launch { scrim.animateTo(0.72f, tween(180)) }
            launch { label.animateTo(1f, tween(260, delayMillis = 120)) }
            if (e is HandoffCoordinator.Transfer.ToPc) {
                // Settle, glow, then lift off toward the PC.
                artAlpha.snapTo(1f)
                scale.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = 500f))
                launch { ring.animateTo(1f, tween(700, easing = LinearOutSlowInEasing)) }
                delay(160)
                launch { tilt.animateTo(24f, tween(560, easing = FastOutLinearInEasing)) }
                launch { scale.animateTo(0.42f, tween(560, easing = FastOutLinearInEasing)) }
                launch { artAlpha.animateTo(0f, tween(260, delayMillis = 320)) }
                y.animateTo(-1.25f, tween(560, easing = FastOutLinearInEasing))
                delay(380)
            } else {
                // Drop in from the PC, land with a pulse.
                launch { artAlpha.animateTo(1f, tween(160)) }
                launch { scale.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = 260f)) }
                y.animateTo(0f, spring(dampingRatio = 0.72f, stiffness = 240f))
                ring.animateTo(1f, tween(600, easing = LinearOutSlowInEasing))
                delay(500)
                launch { artAlpha.animateTo(0f, tween(240)) }
            }
            launch { label.animateTo(0f, tween(200)) }
            scrim.animateTo(0f, tween(260))
        }
        event = null
    }

    BoxWithConstraints(Modifier.fillMaxSize().background(Color.Black.copy(alpha = scrim.value)), contentAlignment = Alignment.Center) {
        val heightPx = with(LocalDensity.current) { maxHeight.toPx() }
        val size = (maxWidth * 0.62f).coerceAtMost(300.dp)
        // Expanding glow ring in the art's color.
        Canvas(Modifier.size(size * 1.9f).graphicsLayer { alpha = (1f - ring.value) * 0.9f }) {
            val r = this.size.minDimension / 2 * (0.55f + ring.value * 0.45f)
            drawCircle(Brush.radialGradient(listOf(color.copy(alpha = 0.55f), Color.Transparent)), radius = r)
            drawCircle(color.mix(Color.White, 0.35f), radius = r, style = Stroke(width = 3.dp.toPx() * (1f - ring.value) + 1f))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier
                    .size(size)
                    .graphicsLayer {
                        translationY = y.value * heightPx
                        scaleX = scale.value; scaleY = scale.value
                        rotationX = tilt.value
                        cameraDistance = 14f * density
                        this.alpha = artAlpha.value
                        shadowElevation = 24.dp.toPx()
                        shape = RoundedCornerShape(Radii.hero)
                        clip = true
                    },
            ) { Artwork(art, null, Modifier.fillMaxSize(), RoundedCornerShape(Radii.hero)) }
        }
    }
}
