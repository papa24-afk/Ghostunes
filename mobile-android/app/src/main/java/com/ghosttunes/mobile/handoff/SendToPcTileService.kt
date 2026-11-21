package com.ghosttunes.mobile.handoff

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile "Send to PC": runs the same push/pull as the sticker. */
class SendToPcTileService : TileService() {
    override fun onStartListening() {
        qsTile?.apply {
            state = Tile.STATE_INACTIVE
            if (Build.VERSION.SDK_INT >= 29) subtitle = "Ghosttunes"
            updateTile()
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        val intent = Intent(this, HandoffActivity::class.java)
            .setAction(HandoffActivity.ACTION_TILE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val launch = {
            if (Build.VERSION.SDK_INT >= 34) {
                startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
            } else {
                @Suppress("DEPRECATION") startActivityAndCollapse(intent)
            }
        }
        if (isLocked) unlockAndRun { launch() } else launch()
    }
}
