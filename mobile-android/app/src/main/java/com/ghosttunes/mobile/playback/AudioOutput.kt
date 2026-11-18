package com.ghosttunes.mobile.playback

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Where this phone's audio is going: a Bluetooth headset/speaker, wired or USB headphones, or the speaker. */
data class OutputDevice(val name: String, val kind: Kind) {
    enum class Kind { Bluetooth, Wired, Speaker }
}

@Singleton
class AudioOutput @Inject constructor(context: Context) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val _current = MutableStateFlow(read())
    val current: StateFlow<OutputDevice> = _current

    init {
        audio?.registerAudioDeviceCallback(object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) { _current.value = read() }
            override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) { _current.value = read() }
        }, Handler(Looper.getMainLooper()))
    }

    private fun read(): OutputDevice {
        val outs = audio?.getDevices(AudioManager.GET_DEVICES_OUTPUTS).orEmpty()
        val bluetooth = setOf(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, 26 /* BLE_HEADSET */, 27 /* BLE_SPEAKER */, 30 /* BLE_BROADCAST */)
        val wired = setOf(AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE)
        outs.firstOrNull { it.type in bluetooth }?.let { return OutputDevice(it.productName?.toString()?.ifBlank { null } ?: "Bluetooth", OutputDevice.Kind.Bluetooth) }
        outs.firstOrNull { it.type in wired }?.let { return OutputDevice(if (it.type == AudioDeviceInfo.TYPE_USB_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_DEVICE) "USB headphones" else "Headphones", OutputDevice.Kind.Wired) }
        return OutputDevice("Phone speaker", OutputDevice.Kind.Speaker)
    }
}
