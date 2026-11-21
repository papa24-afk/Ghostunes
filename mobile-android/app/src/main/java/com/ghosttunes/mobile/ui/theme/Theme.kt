package com.ghosttunes.mobile.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.ghosttunes.mobile.R

/** Colors: near-black surfaces, one accent used sparingly. Contrast ratios are against [Bg]. */
object GT {
    val Bg = Color(0xFF0B0B0C)
    val Surface1 = Color(0xFF121214)
    val Surface2 = Color(0xFF18181B)
    val Surface3 = Color(0xFF222226)
    val Outline = Color(0xFF2A2A2E)
    val Text = Color(0xFFF4F4F5)
    val TextSecondary = Color(0xFFA1A1AA) // 7.4:1
    val TextTertiary = Color(0xFF7C7C85) // 4.6:1
    val Accent = Color(0xFFE0536C) // 5.2:1
    val AccentPressed = Color(0xFFC8455D)
    val OnAccent = Color(0xFF0B0B0C)
    val Error = Color(0xFFF2777A)
    val Success = Color(0xFF6FD39B)
}

/** 8dp grid with 4dp half-steps. */
object Space {
    val xxs = 4.dp
    val xs = 8.dp
    val sm = 12.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
    val xxl = 48.dp
    val edge = 16.dp
    val row = 64.dp
    val rowArt = 48.dp
    val compactRow = 56.dp
    val compactArt = 40.dp
    val card = 152.dp
    val touch = 48.dp
    val miniPlayer = 64.dp
    val navBar = 64.dp
}

object Radii {
    val rowArt = 4.dp
    val card = 6.dp
    val hero = 8.dp
    val sheet = 16.dp
}

@OptIn(ExperimentalTextApi::class)
private fun inter(weight: Int) = Font(
    R.font.inter,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

@OptIn(ExperimentalTextApi::class)
val Inter = FontFamily(inter(400), inter(500), inter(600), inter(700), inter(800))

/** Seven sizes, nothing else. Times use [TypeScale.tabular]. */
object TypeScale {
    val display = TextStyle(fontFamily = Inter, fontSize = 32.sp, lineHeight = 38.sp, fontWeight = FontWeight(800), letterSpacing = (-0.5).sp)
    val headline = TextStyle(fontFamily = Inter, fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp)
    val title = TextStyle(fontFamily = Inter, fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.2).sp)
    val nowPlayingTitle = title.copy(fontSize = 22.sp, lineHeight = 28.sp)
    val bodyLarge = TextStyle(fontFamily = Inter, fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold)
    val body = TextStyle(fontFamily = Inter, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal)
    val label = TextStyle(fontFamily = Inter, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.02.em)
    val caption = TextStyle(fontFamily = Inter, fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.02.em)
    val lyric = TextStyle(fontFamily = Inter, fontSize = 28.sp, lineHeight = 36.sp, fontWeight = FontWeight(800), letterSpacing = (-0.3).sp)
    val tabular = caption.copy(fontFeatureSettings = "tnum")
}

@Immutable
object Motion {
    val press = spring<Float>(dampingRatio = 0.6f, stiffness = 800f)
    val expand = spring<Float>(dampingRatio = 0.88f, stiffness = 380f)
    val artPause = spring<Float>(dampingRatio = 0.7f, stiffness = 300f)
    val gentle = spring<Float>(dampingRatio = Spring.DampingRatioNoBouncy, stiffness = Spring.StiffnessMediumLow)
    const val colorMs = 600
    const val fadeMs = 220
}

private val scheme = darkColorScheme(
    primary = GT.Accent,
    onPrimary = GT.OnAccent,
    secondary = GT.Text,
    onSecondary = GT.Bg,
    background = GT.Bg,
    onBackground = GT.Text,
    surface = GT.Bg,
    onSurface = GT.Text,
    surfaceVariant = GT.Surface2,
    onSurfaceVariant = GT.TextSecondary,
    surfaceContainer = GT.Surface1,
    surfaceContainerHigh = GT.Surface2,
    surfaceContainerHighest = GT.Surface3,
    surfaceContainerLow = GT.Surface1,
    surfaceContainerLowest = GT.Bg,
    outline = GT.Outline,
    outlineVariant = GT.Outline,
    error = GT.Error,
    inverseSurface = GT.Text,
    inverseOnSurface = GT.Bg,
    scrim = Color.Black,
)

private val typography = Typography(
    displayLarge = TypeScale.display, displayMedium = TypeScale.display, displaySmall = TypeScale.display,
    headlineLarge = TypeScale.headline, headlineMedium = TypeScale.headline, headlineSmall = TypeScale.title,
    titleLarge = TypeScale.title, titleMedium = TypeScale.bodyLarge, titleSmall = TypeScale.label,
    bodyLarge = TypeScale.bodyLarge, bodyMedium = TypeScale.body, bodySmall = TypeScale.label,
    labelLarge = TypeScale.label, labelMedium = TypeScale.label, labelSmall = TypeScale.caption,
)

@Composable
fun GhosttunesTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = scheme, typography = typography, content = content)
}
