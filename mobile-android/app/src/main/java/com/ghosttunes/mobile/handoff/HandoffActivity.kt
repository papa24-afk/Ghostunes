package com.ghosttunes.mobile.handoff

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.ghosttunes.mobile.ui.components.HandoffPill
import com.ghosttunes.mobile.ui.theme.GhosttunesTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Started by the NFC sticker (ghosttunes://handoff), a VIEW intent, or the Quick Settings tile.
 * Runs the handoff, shows only the status pill over whatever is on screen, then finishes.
 */
@AndroidEntryPoint
class HandoffActivity : ComponentActivity() {
    @Inject lateinit var coordinator: HandoffCoordinator

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        if (savedInstanceState == null) handle(intent)

        setContent {
            GhosttunesTheme {
                val status by coordinator.status.collectAsState()
                com.ghosttunes.mobile.ui.components.TransferOverlay(coordinator)
                Box(Modifier.fillMaxSize().statusBarsPadding(), contentAlignment = Alignment.TopCenter) {
                    HandoffPill(status)
                }
                LaunchedEffect(status) {
                    val s = status
                    if (s == null) {
                        delay(1_500)
                        if (coordinator.status.value == null) finish()
                    } else if (s.terminal) {
                        delay(2_400)
                        finish()
                    }
                }
            }
        }
        // Safety net: never linger.
        lifecycleScope.launch { delay(25_000); finish() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent?) {
        val data = intent?.data
        val fromSticker = data?.scheme == "ghosttunes" && data.host == "handoff"
        val fromTile = intent?.action == ACTION_TILE
        if (fromSticker || fromTile) coordinator.trigger(if (fromTile) "tile" else "nfc")
    }

    override fun finish() {
        super.finish()
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
    }

    companion object {
        const val ACTION_TILE = "com.ghosttunes.mobile.action.HANDOFF_TILE"
    }
}
