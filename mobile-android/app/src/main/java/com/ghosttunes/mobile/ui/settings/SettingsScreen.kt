package com.ghosttunes.mobile.ui.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.BuildConfig
import com.ghosttunes.mobile.data.prefs.FlickSensitivity
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.download.DownloadRepository
import com.ghosttunes.mobile.playback.AudioCache
import com.ghosttunes.mobile.ui.DebugRoute
import com.ghosttunes.mobile.ui.DownloadsRoute
import com.ghosttunes.mobile.ui.LocalActions
import com.ghosttunes.mobile.ui.LocalBottomPadding
import com.ghosttunes.mobile.ui.collection.formatBytes
import com.ghosttunes.mobile.ui.components.Chip
import com.ghosttunes.mobile.ui.components.PillButton
import com.ghosttunes.mobile.ui.onboarding.ConnectViewModel
import com.ghosttunes.mobile.ui.onboarding.ServerConnectPanel
import com.ghosttunes.mobile.ui.onboarding.TestState
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    val settings: SettingsRepository,
    private val downloads: DownloadRepository,
    private val cache: AudioCache,
) : ViewModel() {
    val storage = MutableStateFlow(0L to 0L)

    init { refreshStorage() }

    fun refreshStorage() = viewModelScope.launch {
        val d = downloads.storageBytes()
        val c = withContext(Dispatchers.IO) { cache.bytes() }
        storage.value = d to c
    }

    fun clearCache() = viewModelScope.launch { withContext(Dispatchers.IO) { cache.clear() }; refreshStorage() }
    fun set(block: suspend SettingsRepository.() -> Unit) = viewModelScope.launch { settings.block() }
}

@Composable
fun SettingsScreen(vm: SettingsViewModel = hiltViewModel(), connect: ConnectViewModel = hiltViewModel()) {
    val s by vm.settings.settings.collectAsState()
    val storage by vm.storage.collectAsState()
    val conn by connect.state.collectAsState()
    val actions = LocalActions.current
    val bottom = LocalBottomPadding.current
    val scope = rememberCoroutineScope()
    var versionTaps by remember { mutableIntStateOf(0) }
    var lastTap by remember { mutableLongStateOf(0L) }
    var showNfcHelp by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.statusBarsPadding().fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { actions.nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back", tint = GT.Text) }
            Text("Settings", style = TypeScale.title, color = GT.Text)
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = bottom)) {
            Section("Your PC")
            Column(Modifier.padding(horizontal = Space.edge)) {
                val changed = conn.address.trimEnd('/') != s.serverUrl
                Text(
                    if (changed) "Unsaved address" else "Connected to ${s.serverUrl.removePrefix("http://")}",
                    style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.padding(bottom = Space.sm),
                )
                ServerConnectPanel(conn, connect)
                AnimatedVisibility(changed) {
                    PillButton("Save address", { connect.save { actions.snack("Server saved") } }, filled = conn.test == TestState.Ok, modifier = Modifier.padding(top = Space.sm))
                }
            }

            Section("Playback")
            ToggleRow("Data saver streaming", "Lower bitrate when streaming from your PC", s.lowQualityStreaming) { v -> vm.set { setLowQualityStreaming(v) } }
            ToggleRow("Autoplay", "Keep playing similar songs when your queue ends", s.autoplay) { v -> vm.set { setAutoplay(v) } }

            Section("Downloads")
            ToggleRow("Data saver downloads", "Smaller files, lower quality", s.lowQualityDownloads) { v -> vm.set { setLowQualityDownloads(v) } }
            ValueRow("Downloaded music", formatBytes(storage.first), action = "Manage") { actions.nav.navigate(DownloadsRoute) }
            ValueRow("Streaming cache", formatBytes(storage.second), action = "Clear") { vm.clearCache(); actions.snack("Cache cleared") }

            Section("Send to PC")
            ToggleRow("Flick to PC", "Flick your phone toward your PC to move what's playing", s.flickEnabled) { v -> vm.set { setFlickEnabled(v) } }
            AnimatedVisibility(s.flickEnabled) {
                Column {
                    Column(Modifier.padding(horizontal = Space.edge, vertical = Space.sm)) {
                        Text("Sensitivity", style = TypeScale.bodyLarge, color = GT.Text)
                        Text(
                            when (s.flickSensitivity) {
                                FlickSensitivity.Low -> "Needs a firm flick. Fewest accidental triggers."
                                FlickSensitivity.Medium -> "Balanced for most phones."
                                FlickSensitivity.High -> "A lighter flick works. May trigger more easily."
                            },
                            style = TypeScale.body, color = GT.TextSecondary,
                        )
                        Spacer(Modifier.height(Space.sm))
                        Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
                            FlickSensitivity.entries.forEach { f -> Chip(f.label, s.flickSensitivity == f, { vm.set { setFlickSensitivity(f) } }) }
                        }
                    }
                    ToggleRow("Flick works in background", "While music plays and the screen is on, even outside the app", s.flickInBackground) { v -> vm.set { setFlickInBackground(v) } }
                }
            }
            ValueRow("NFC sticker", "Tap the phone on a sticker to send or get music", action = if (showNfcHelp) "Hide" else "How to") { showNfcHelp = !showNfcHelp }
            AnimatedVisibility(showNfcHelp) {
                Text(
                    "1. Install NFC Tools from the Play Store.\n2. Write → Add a record → Custom URL / URI.\n3. Enter ghosttunes://handoff and tap Write.\n4. Hold a blank NFC sticker to the back of your phone.\n5. Stick it near your PC. Tap it to send what's playing, or to pick up what your PC is playing.\n\nYou can also add the \"Send to PC\" tile in Quick Settings.",
                    style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.padding(horizontal = Space.edge, vertical = Space.xs),
                )
            }

            Section("About")
            ValueRow("Version", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") {
                val now = System.currentTimeMillis()
                versionTaps = if (now - lastTap < 600) versionTaps + 1 else 1
                lastTap = now
                when {
                    s.debugUnlocked -> actions.nav.navigate(DebugRoute)
                    versionTaps >= 7 -> { scope.launch { vm.settings.unlockDebug() }; actions.snack("Flick debug unlocked"); actions.nav.navigate(DebugRoute) }
                    versionTaps >= 4 -> actions.snack("${7 - versionTaps} more taps")
                }
            }
            ValueRow("Typeface", "Inter, SIL Open Font License")
            Spacer(Modifier.height(Space.xl))
        }
    }
}

@Composable
private fun Section(title: String) {
    Text(
        title.uppercase(), style = TypeScale.caption.copy(letterSpacing = TypeScale.caption.letterSpacing * 4), color = GT.TextTertiary,
        modifier = Modifier.padding(start = Space.edge, end = Space.edge, top = Space.xl, bottom = Space.xs),
    )
}

@Composable
private fun ToggleRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clickable { onChange(!checked) }
            .semantics(mergeDescendants = true) { role = Role.Switch; toggleableState = ToggleableState(checked) }
            .padding(horizontal = Space.edge, vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f).padding(end = Space.md)) {
            Text(title, style = TypeScale.bodyLarge, color = GT.Text)
            Text(subtitle, style = TypeScale.body, color = GT.TextSecondary)
        }
        Switch(
            checked = checked, onCheckedChange = null,
            colors = SwitchDefaults.colors(
                checkedThumbColor = GT.Bg, checkedTrackColor = GT.Accent, checkedBorderColor = GT.Accent,
                uncheckedThumbColor = GT.TextSecondary, uncheckedTrackColor = GT.Surface3, uncheckedBorderColor = GT.Surface3,
            ),
        )
    }
}

@Composable
private fun ValueRow(title: String, value: String, action: String? = null, onClick: (() -> Unit)? = null) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = Space.edge, vertical = Space.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = TypeScale.bodyLarge, color = GT.Text)
            Text(value, style = TypeScale.body.copy(fontFeatureSettings = "tnum"), color = GT.TextSecondary)
        }
        if (action != null) Text(action, style = TypeScale.label, color = GT.Text)
    }
}

