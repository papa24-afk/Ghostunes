package com.ghosttunes.mobile.ui.components

import android.graphics.Bitmap
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.core.graphics.ColorUtils
import androidx.palette.graphics.Palette
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Motion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

/** Album-art-driven color, darkened so white text always reads (≥ 4.5:1). Cached per model. */
object ArtColors {
    private val cache = ConcurrentHashMap<String, Int>()
    val Fallback = Color(0xFF2A2A30)

    fun cached(key: String): Color? = cache[key]?.let { Color(it) }

    suspend fun extract(context: android.content.Context, model: Any): Color? {
        val key = model.toString()
        cache[key]?.let { return Color(it) }
        val request = ImageRequest.Builder(context).data(model).size(128).allowHardware(false).build()
        val result = SingletonImageLoader.get(context).execute(request) as? SuccessResult ?: return null
        val bitmap: Bitmap = result.image.toBitmap()
        val color = withContext(Dispatchers.Default) {
            val palette = Palette.from(bitmap).maximumColorCount(16).generate()
            val swatch = palette.vibrantSwatch ?: palette.darkVibrantSwatch ?: palette.dominantSwatch ?: palette.mutedSwatch
            swatch?.rgb?.let(::tame)
        } ?: return null
        cache[key] = color
        return Color(color)
    }

    /** Clamp lightness ≤ 0.32 and saturation ≤ 0.65 (no neon, always readable). */
    fun tame(rgb: Int): Int {
        val hsl = FloatArray(3)
        ColorUtils.colorToHSL(rgb, hsl)
        hsl[1] = hsl[1].coerceAtMost(0.65f)
        hsl[2] = hsl[2].coerceIn(0.14f, 0.32f)
        return ColorUtils.HSLToColor(hsl)
    }
}

/** Animated palette color for a piece of artwork (600 ms between tracks). */
@Composable
fun rememberArtColor(model: Any?, fallback: Color = ArtColors.Fallback): State<Color> {
    val context = LocalContext.current
    var target by remember { mutableStateOf(model?.let { ArtColors.cached(it.toString()) } ?: fallback) }
    LaunchedEffect(model) {
        if (model == null || (model is String && model.isBlank())) return@LaunchedEffect
        runCatching { ArtColors.extract(context, model) }.getOrNull()?.let { target = it }
    }
    return animateColorAsState(target, tween(Motion.colorMs), label = "artColor")
}

fun Color.mix(other: Color, amount: Float): Color = Color(ColorUtils.blendARGB(toArgb(), other.toArgb(), amount))

fun Color.onBg(amount: Float) = mix(GT.Bg, amount)
