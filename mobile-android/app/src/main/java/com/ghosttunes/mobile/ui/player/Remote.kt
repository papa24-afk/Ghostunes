package com.ghosttunes.mobile.ui.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import com.ghosttunes.mobile.handoff.RemoteState
import com.ghosttunes.mobile.playback.Progress
import kotlinx.coroutines.delay

/** The PC's progress while the phone is a remote, ticking smoothly between the 1 s updates. */
@Composable
fun rememberRemoteProgress(remote: RemoteState?): Progress? {
    val p by produceState<Progress?>(null, remote) {
        if (remote == null) { value = null; return@produceState }
        while (true) {
            val durMs = (remote.durationSec * 1000).toLong()
            value = Progress((remote.positionNow() * 1000).toLong(), durMs, durMs)
            delay(250)
        }
    }
    return p
}
