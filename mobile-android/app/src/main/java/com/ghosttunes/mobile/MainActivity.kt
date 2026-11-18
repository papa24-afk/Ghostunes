package com.ghosttunes.mobile

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.ghosttunes.mobile.data.prefs.SettingsRepository
import com.ghosttunes.mobile.handoff.FlickMonitor
import com.ghosttunes.mobile.handoff.FlickSensor
import com.ghosttunes.mobile.handoff.HandoffCoordinator
import com.ghosttunes.mobile.playback.PlaybackConnection
import com.ghosttunes.mobile.ui.AppRoot
import com.ghosttunes.mobile.ui.theme.GhosttunesTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var playback: PlaybackConnection
    @Inject lateinit var settings: SettingsRepository
    @Inject lateinit var handoff: HandoffCoordinator
    @Inject lateinit var flickMonitor: FlickMonitor
    @Inject lateinit var locator: com.ghosttunes.mobile.data.net.PcLocator

    /** Set when the notification or a handoff asks to show Now Playing. */
    val openPlayerRequests = MutableStateFlow(0)
    private var flickSensor: FlickSensor? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        playback.connect()
        handleIntent(intent)
        setContent {
            GhosttunesTheme {
                AppRoot(openPlayerRequests = openPlayerRequests)
            }
        }

        // Foreground flick: active while the app is visible, unless the service is already listening
        // (background flick on + music playing), so there's only ever one sensor listener.
        flickSensor = FlickSensor(this, flickMonitor) { handoff.trigger("flick") }
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                combine(settings.settings, playback.state) { s, p ->
                    (s.flickEnabled && !(s.flickInBackground && p.isPlaying)) to s.flickSensitivity
                }.collect { (on, sensitivity) ->
                    if (on) flickSensor?.start(sensitivity) else flickSensor?.stop()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Quietly re-find the PC if its address changed (new Wi-Fi, hotspot...).
        lifecycleScope.launch { runCatching { locator.ensure(allowScan = false) } }
    }

    override fun onPause() {
        super.onPause()
        flickSensor?.stop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_OPEN_PLAYER, false) == true) openPlayerRequests.value++
    }

    companion object {
        const val EXTRA_OPEN_PLAYER = "open_player"
    }
}
