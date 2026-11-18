package com.ghosttunes.mobile.handoff

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.ghosttunes.mobile.data.prefs.FlickSensitivity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Live data for the hidden debug screen. Only filled while the debug screen is open. */
@Singleton
class FlickMonitor @Inject constructor() {
    data class Point(val t: Long, val x: Float, val y: Float, val z: Float)
    data class Detection(val t: Long, val source: String)

    @Volatile var observing = false
    private val _points = MutableStateFlow<List<Point>>(emptyList())
    val points: StateFlow<List<Point>> = _points
    private val _detections = MutableStateFlow<List<Detection>>(emptyList())
    val detections: StateFlow<List<Detection>> = _detections
    private val _sensorName = MutableStateFlow("—")
    val sensorName: StateFlow<String> = _sensorName

    fun onSample(t: Long, x: Float, y: Float, z: Float) {
        if (!observing) return
        val list = _points.value
        _points.value = (if (list.size >= 400) list.drop(list.size - 399) else list) + Point(t, x, y, z)
    }

    fun onDetection(source: String) {
        _detections.value = (listOf(Detection(System.currentTimeMillis(), source)) + _detections.value).take(20)
    }

    fun setSensor(name: String) { _sensorName.value = name }
}

/** Buzz for a flick or an action. */
fun Context.vibrate(ms: Long = 35) {
    val vibrator = if (Build.VERSION.SDK_INT >= 31) {
        getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
    }
    vibrator?.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
}

/**
 * Feeds [FlickDetector] from TYPE_LINEAR_ACCELERATION at ~100 Hz (fallback: accelerometer with a
 * gravity low-pass). Also listens to proximity and gravity for pocket / face-down rejection.
 */
class FlickSensor(
    private val context: Context,
    private val monitor: FlickMonitor?,
    private val onFlick: () -> Unit,
) : SensorEventListener {
    private val manager = context.getSystemService(SensorManager::class.java)
    private val linear: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    private val accel: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val proximity: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
    private val gravitySensor: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private val gyro: Sensor? = manager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val detector = FlickDetector()
    private var running = false

    val available: Boolean get() = linear != null || accel != null

    fun start(sensitivity: FlickSensitivity) {
        detector.config = FlickConfig().scaled(sensitivity.scale)
        if (running || manager == null) return
        val main = linear ?: accel ?: return
        running = true
        detector.reset()
        manager.registerListener(this, main, SAMPLING_US)
        proximity?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        if (linear != null) gravitySensor?.let { manager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        gyro?.let { manager.registerListener(this, it, SAMPLING_US) }
        monitor?.setSensor(if (linear != null) "Linear acceleration (${main.name})" else "Accelerometer + gravity filter (${main.name})")
    }

    fun stop() {
        if (!running) return
        running = false
        manager?.unregisterListener(this)
        detector.reset()
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_PROXIMITY -> detector.proximityNear = event.values[0] < (proximity?.maximumRange ?: 5f) * 0.5f
            Sensor.TYPE_GRAVITY -> detector.gravityZ = event.values[2]
            Sensor.TYPE_GYROSCOPE -> {
                if (detector.addGyro(event.values[0], event.values[1], event.values[2], event.timestamp / 1_000_000)) {
                    context.vibrate(70)
                    monitor?.onDetection("twist")
                    onFlick()
                }
            }
            Sensor.TYPE_LINEAR_ACCELERATION, Sensor.TYPE_ACCELEROMETER -> {
                val t = event.timestamp / 1_000_000
                val (x, y, z) = Triple(event.values[0], event.values[1], event.values[2])
                val fired = if (event.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
                    detector.addLinear(x, y, z, t)
                } else {
                    detector.addWithGravity(x, y, z, t)
                }
                monitor?.onSample(t, x, y, z)
                if (fired) {
                    context.vibrate(70)
                    monitor?.onDetection("sensor")
                    onFlick()
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    companion object {
        const val SAMPLING_US = 10_000 // 100 Hz
    }
}
