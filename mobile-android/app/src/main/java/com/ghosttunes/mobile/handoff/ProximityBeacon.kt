package com.ghosttunes.mobile.handoff

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.ghosttunes.mobile.data.net.ServerConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.security.SecureRandom
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * "Bring the phone close to the PC": sends a low-power Bluetooth beacon the PC measures,
 * and listens for the PC saying "you're close" (then runs the same transfer as a flick).
 * Holders (the visible app, the playing service) ask for it; it runs while anyone holds it.
 */
@Singleton
class ProximityBeacon @Inject constructor(
    private val context: Context,
    private val config: ServerConfig,
    private val client: OkHttpClient,
    private val scope: CoroutineScope,
) {
    private val holders = mutableSetOf<String>()
    private var advertising = false
    private var listenJob: Job? = null

    /** 4 random bytes identifying this phone to the PC (kept for the app's lifetime on this install). */
    val id: String by lazy {
        val prefs = context.getSharedPreferences("proximity", Context.MODE_PRIVATE)
        prefs.getString("id", null) ?: ByteArray(4).also { SecureRandom().nextBytes(it) }
            .joinToString("") { "%02x".format(it) }.also { prefs.edit().putString("id", it).apply() }
    }

    fun hasPermission(): Boolean = Build.VERSION.SDK_INT < 31 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED

    @Synchronized
    fun hold(who: String, on: Boolean) {
        if (on) holders += who else holders -= who
        if (holders.isNotEmpty()) start() else stop()
    }

    private val callback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            Log.w(TAG, "beacon failed: $errorCode")
            advertising = false
        }
    }

    @SuppressLint("MissingPermission")
    private fun start() {
        if (!advertising && hasPermission()) {
            val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
            val advertiser = if (adapter?.isEnabled == true) adapter.bluetoothLeAdvertiser else null
            if (advertiser != null) {
                val payload = byteArrayOf(0x47, 0x54, 0x55, 0x4E) + id.chunked(2).map { it.toInt(16).toByte() }
                val settings = AdvertiseSettings.Builder()
                    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                    // Low power on purpose: the signal is only strong when the phone is really close.
                    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_LOW)
                    .setConnectable(false)
                    .build()
                val data = AdvertiseData.Builder().addManufacturerData(0xFFFF, payload).setIncludeDeviceName(false).build()
                runCatching { advertiser.startAdvertising(settings, data, callback); advertising = true }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun stop() {
        if (advertising) {
            runCatching { context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser?.stopAdvertising(callback) }
            advertising = false
        }
    }

    companion object { private const val TAG = "GhosttunesProximity" }
}
