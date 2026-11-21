package com.ghosttunes.mobile.ui.settings

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.handoff.FlickConfig
import com.ghosttunes.mobile.handoff.FlickDetector
import com.ghosttunes.mobile.handoff.FlickMonitor
import com.ghosttunes.mobile.handoff.FlickSensor
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.components.PillButton
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import kotlin.math.PI
import kotlin.math.sin

@HiltViewModel
class DebugViewModel @Inject constructor(
    val monitor: FlickMonitor,
    val coordinator: HandoffCoordinator,
    val settings: SettingsRepository,
) : ViewModel() {
    /**
     * Feeds a synthetic 100 Hz flick (still → 26 m/s² push → 18 m/s² brake → still) through a real
     * detector with the current sensitivity. If it fires, it triggers a real handoff.
     */
    fun simulateFlick(): Boolean {
        val detector = FlickDetector(FlickConfig().scaled(settings.current.flickSensitivity.scale))
        var fired = false
        var t = 0L
        fun pulse(ms: Long, start: Long, len: Long, peak: Double) = if (ms in start until start + len) peak * sin(PI * (ms - start) / len) else 0.0
        while (t < 1_400) {
            val y = pulse(t, 700, 140, 26.0) + pulse(t, 840, 160, -18.0)
            if (detector.addLinear(0.1f, y.toFloat(), 0.1f, t)) fired = true
            monitor.onSample(t, 0.1f, y.toFloat(), 0.1f)
            t += 10
        }
        if (fired) {
            monitor.onDetection("synthetic")
            coordinator.trigger("debug-synthetic")
        }
        return fired
    }
}

@Composable
fun DebugScreen(vm: DebugViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val actions = LocalActions.current
    val bottom = LocalBottomPadding.current
    val points by vm.monitor.points.collectAsState()
    val detections by vm.monitor.detections.collectAsState()
    val sensorName by vm.monitor.sensorName.collectAsState()
    val settings by vm.settings.settings.collectAsState()
    val cfg = remember(settings.flickSensitivity) { FlickConfig().scaled(settings.flickSensitivity.scale) }

    // Own sensor while this screen is open, so the graph shows data even if Flick is off.
    DisposableEffect(settings.flickSensitivity) {
        vm.monitor.observing = true
        val sensor = FlickSensor(context, vm.monitor) { vm.coordinator.trigger("debug-sensor") }
        sensor.start(settings.flickSensitivity)
        onDispose { sensor.stop(); vm.monitor.observing = false }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.statusBarsPadding().fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { actions.nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = GT.Text) }
            Text("Flick debug", style = TypeScale.title, color = GT.Text)
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = Space.edge).padding(bottom = bottom)) {
            Text(sensorName, style = TypeScale.label, color = GT.TextSecondary)
            Text(
                "Push ≥ %.1f m/s² in any direction for %d–%d ms, then brake ≥ %.1f m/s² back the other way within %d ms. Cooldown %d s. Sensitivity: %s."
                    .format(cfg.pushThreshold, cfg.minPushMs, cfg.maxPushMs, cfg.brakeThreshold, cfg.brakeWindowMs, cfg.cooldownMs / 1000, settings.flickSensitivity.label),
                style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.padding(top = Space.xxs),
            )
            Spacer(Modifier.height(Space.md))
            Legend()
            Spacer(Modifier.height(Space.xs))
            Graph(points.map { Triple(it.x, it.y, it.z) }, cfg.pushThreshold, cfg.brakeThreshold)
            Spacer(Modifier.height(Space.md))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                PillButton("Simulate flick", {
                    actions.snack(if (vm.simulateFlick()) "Synthetic flick detected, sending" else "Synthetic flick not detected")
                }, filled = true)
            }
            Spacer(Modifier.height(Space.lg))
            Text("Detections", style = TypeScale.bodyLarge, color = GT.Text)
            if (detections.isEmpty()) Text("None yet. Flick the phone toward your PC.", style = TypeScale.body, color = GT.TextSecondary)
            val fmt = remember { SimpleDateFormat("HH:mm:ss", Locale.US) }
            detections.forEach { d ->
                Text("${fmt.format(Date(d.t))}  ${d.source}", style = TypeScale.body.copy(fontFeatureSettings = "tnum"), color = GT.Text)
            }
        }
    }
}

private val X = Color(0xFFE0536C)
private val Y = Color(0xFF6FD39B)
private val Z = Color(0xFF7FB2F0)

@Composable
private fun Legend() {
    Row(horizontalArrangement = Arrangement.spacedBy(Space.md)) {
        listOf("x" to X, "y" to Y, "z" to Z).forEach { (n, c) ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.size(8.dp).clip(CircleShape).background(c))
                Text(" $n", style = TypeScale.label, color = GT.TextSecondary)
            }
        }
        Text("dashed = push / brake thresholds", style = TypeScale.label, color = GT.TextTertiary)
    }
}

@Composable
private fun Graph(points: List<Triple<Float, Float, Float>>, push: Float, brake: Float) {
    val range = 30f
    Canvas(Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(Radii.hero)).background(GT.Surface2)) {
        val mid = size.height / 2
        fun yOf(v: Float) = mid - (v.coerceIn(-range, range) / range) * (size.height / 2)
        val dash = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(8f, 8f))
        listOf(push, -push).forEach { drawLine(GT.TextTertiary, Offset(0f, yOf(it)), Offset(size.width, yOf(it)), 1f, pathEffect = dash) }
        listOf(brake, -brake).forEach { drawLine(GT.Outline, Offset(0f, yOf(it)), Offset(size.width, yOf(it)), 1f, pathEffect = dash) }
        drawLine(GT.Outline, Offset(0f, mid), Offset(size.width, mid), 1f)
        if (points.size < 2) return@Canvas
        val step = size.width / 399f
        listOf<(Triple<Float, Float, Float>) -> Float>({ it.first }, { it.second }, { it.third }).zip(listOf(X, Y, Z)).forEach { (sel, color) ->
            val path = Path()
            points.forEachIndexed { i, p ->
                val x = (400 - points.size + i) * step
                if (i == 0) path.moveTo(x, yOf(sel(p))) else path.lineTo(x, yOf(sel(p)))
            }
            drawPath(path, color, style = Stroke(2f))
        }
    }
}
