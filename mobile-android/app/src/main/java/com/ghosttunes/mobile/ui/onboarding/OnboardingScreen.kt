package com.ghosttunes.mobile.ui.onboarding

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ghosttunes.mobile.BuildConfig
import com.ghosttunes.mobile.R
import com.ghosttunes.mobile.data.net.ServerConfig
import com.ghosttunes.mobile.data.net.ServerDiscovery
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.data.repo.MusicRepository
import com.ghosttunes.mobile.ui.components.PillButton
import com.ghosttunes.mobile.ui.theme.GT
import com.ghosttunes.mobile.ui.theme.Radii
import com.ghosttunes.mobile.ui.theme.Space
import com.ghosttunes.mobile.ui.theme.TypeScale
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class TestState { Idle, Testing, Ok, Failed }

data class ConnectState(
    val address: String,
    val test: TestState = TestState.Idle,
    val scanning: Boolean = false,
    val scanProgress: Float = 0f,
    val found: List<String> = emptyList(),
    val scanDone: Boolean = false,
    val phoneIp: String? = null,
)

@HiltViewModel
class ConnectViewModel @Inject constructor(
    private val music: MusicRepository,
    private val discovery: ServerDiscovery,
    private val settings: SettingsRepository,
    private val config: ServerConfig,
) : ViewModel() {
    private val _state = MutableStateFlow(ConnectState(settings.current.serverUrl.ifBlank { BuildConfig.DEFAULT_SERVER }, phoneIp = discovery.localAddress()))
    val state: StateFlow<ConnectState> = _state
    private var scanJob: Job? = null

    fun setAddress(a: String) = _state.update { it.copy(address = a, test = TestState.Idle) }

    fun test() = viewModelScope.launch {
        val url = ServerConfig.normalize(_state.value.address) ?: run { _state.update { it.copy(test = TestState.Failed) }; return@launch }
        _state.update { it.copy(address = url, test = TestState.Testing) }
        val ok = music.checkServer(url, 4000)
        _state.update { it.copy(test = if (ok) TestState.Ok else TestState.Failed) }
    }

    fun scan() {
        scanJob?.cancel()
        _state.update { it.copy(scanning = true, scanDone = false, found = emptyList(), scanProgress = 0f, phoneIp = discovery.localAddress()) }
        scanJob = viewModelScope.launch {
            discovery.scan().collect { p ->
                _state.update { it.copy(scanProgress = p.checked / p.total.coerceAtLeast(1).toFloat(), found = p.found) }
                if (p.found.size == 1 && _state.value.test != TestState.Ok) {
                    _state.update { it.copy(address = p.found.first(), test = TestState.Ok) }
                }
            }
            _state.update { it.copy(scanning = false, scanDone = true) }
        }
    }

    fun choose(url: String) = _state.update { it.copy(address = url, test = TestState.Ok) }

    fun save(onDone: () -> Unit = {}) = viewModelScope.launch {
        val url = ServerConfig.normalize(_state.value.address) ?: return@launch
        config.set(url)
        music.clearCache()
        settings.setServer(url)
        onDone()
    }
}

@Composable
fun OnboardingScreen(vm: ConnectViewModel = hiltViewModel()) {
    val s by vm.state.collectAsState()
    Column(
        Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()
            .verticalScroll(rememberScrollState()).padding(horizontal = Space.lg),
    ) {
        Spacer(Modifier.height(Space.xxl))
        Icon(painterResource(R.drawable.ic_launcher_foreground), null, tint = GT.Accent, modifier = Modifier.size(72.dp).padding(0.dp))
        Spacer(Modifier.height(Space.md))
        Text("Connect to your PC", style = TypeScale.display, color = GT.Text)
        Spacer(Modifier.height(Space.xs))
        Text(
            "Ghosttunes on your phone plays music through Ghosttunes on your computer. Open it there, keep both on the same Wi-Fi, then connect.",
            style = TypeScale.body, color = GT.TextSecondary,
        )
        Spacer(Modifier.height(Space.xl))
        ServerConnectPanel(s, vm)
        Spacer(Modifier.height(Space.lg))
        PillButton(
            if (s.test == TestState.Ok) "Start listening" else "Use this address anyway",
            onClick = { vm.save() },
            filled = s.test == TestState.Ok,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(Space.xl))
    }
}

/** Address field + Test + Find my PC. Shared with Settings. */
@Composable
fun ServerConnectPanel(s: ConnectState, vm: ConnectViewModel) {
    val focus = LocalFocusManager.current
    Text("PC address", style = TypeScale.label, color = GT.TextSecondary)
    Spacer(Modifier.height(Space.xs))
    Row(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(Radii.hero)).background(GT.Surface2).padding(horizontal = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = s.address,
            onValueChange = vm::setAddress,
            singleLine = true,
            textStyle = TypeScale.bodyLarge.copy(color = GT.Text, fontFeatureSettings = "tnum"),
            cursorBrush = SolidColor(GT.Accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); vm.test() }),
            modifier = Modifier.weight(1f),
        )
        when (s.test) {
            TestState.Testing -> CircularProgressIndicator(Modifier.size(20.dp), color = GT.Text, strokeWidth = 2.dp)
            TestState.Ok -> Icon(Icons.Rounded.CheckCircle, "Connected", tint = GT.Success)
            TestState.Failed -> Icon(Icons.Rounded.ErrorOutline, "Not reachable", tint = GT.Error)
            TestState.Idle -> Unit
        }
    }
    Spacer(Modifier.height(Space.sm))
    Row(horizontalArrangement = Arrangement.spacedBy(Space.xs)) {
        PillButton("Test connection", { focus.clearFocus(); vm.test() }, enabled = s.test != TestState.Testing)
        PillButton(if (s.scanning) "Searching…" else "Find my PC", { focus.clearFocus(); vm.scan() }, enabled = !s.scanning)
    }

    AnimatedVisibility(s.test == TestState.Ok) {
        Text("Connected. Ghosttunes is running on this PC.", style = TypeScale.body, color = GT.Success, modifier = Modifier.padding(top = Space.sm))
    }
    AnimatedVisibility(s.test == TestState.Failed) {
        Column(Modifier.padding(top = Space.md).fillMaxWidth().clip(RoundedCornerShape(Radii.hero)).background(GT.Surface2).padding(Space.md)) {
            Text("Can't reach your PC at this address", style = TypeScale.bodyLarge, color = GT.Text)
            Spacer(Modifier.height(Space.xs))
            listOf(
                "Open Ghosttunes on the computer (it runs the music server).",
                "Connect the phone and the computer to the same Wi-Fi.",
                "Use the computer's Wi-Fi IPv4 from ipconfig, with :3001 at the end.",
                "Allow Ghosttunes through Windows Firewall when Windows asks.",
                "Some school or office Wi-Fi blocks devices from seeing each other; a phone hotspot or home Wi-Fi works.",
            ).forEach { tip ->
                Row(Modifier.padding(vertical = 2.dp)) {
                    Text("•", style = TypeScale.body, color = GT.TextSecondary, modifier = Modifier.width(14.dp))
                    Text(tip, style = TypeScale.body, color = GT.TextSecondary)
                }
            }
        }
    }

    AnimatedVisibility(s.scanning || s.scanDone) {
        Column(Modifier.padding(top = Space.md)) {
            if (s.scanning) {
                LinearProgressIndicator(progress = { s.scanProgress }, modifier = Modifier.fillMaxWidth().clip(CircleShape), color = GT.Accent, trackColor = GT.Surface3, drawStopIndicator = {})
                Spacer(Modifier.height(Space.xs))
                Text("Looking on ${s.phoneIp?.substringBeforeLast('.')?.plus(".x") ?: "your network"}…", style = TypeScale.label, color = GT.TextSecondary)
            }
            if (s.scanDone && s.found.isEmpty()) {
                Text("No PC found on this network. Check that Ghosttunes is open on the computer, or type its address.", style = TypeScale.body, color = GT.TextSecondary)
            }
            s.found.forEach { url ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clip(RoundedCornerShape(Radii.hero)).clickable { vm.choose(url) }.padding(horizontal = Space.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Rounded.Computer, null, tint = GT.Text)
                    Spacer(Modifier.width(Space.sm))
                    Column(Modifier.weight(1f)) {
                        Text("Ghosttunes", style = TypeScale.bodyLarge, color = GT.Text)
                        Text(url.removePrefix("http://"), style = TypeScale.body.copy(fontFeatureSettings = "tnum"), color = GT.TextSecondary)
                    }
                    if (s.address == url) Icon(Icons.Rounded.CheckCircle, "Selected", tint = GT.Success)
                }
            }
        }
    }
}
