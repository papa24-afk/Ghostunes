package com.ghosttunes.mobile.handoff

import kotlin.math.abs
import kotlin.math.sqrt

/**
 * "Flick to PC": a sharp push of the phone followed by braking in the opposite direction.
 * Pure Kotlin (no Android types) so it's tested on the JVM with simulated sensor traces.
 */
data class FlickConfig(
    /** Minimum linear acceleration of the push, m/s². */
    val pushThreshold: Float = 19f,
    /** Share of the push's magnitude that must lie on one axis. */
    val axisDominance: Float = 0.7f,
    /** Braking (opposite direction, same axis) must arrive within this window after the push starts. */
    val brakeWindowMs: Long = 380,
    /** Minimum braking acceleration, m/s². */
    val brakeThreshold: Float = 11f,
    /** The push must stay above half its threshold this long: rejects impacts (table, knocks). */
    val minPushMs: Long = 40,
    /** No further flicks for this long after one fires. */
    val cooldownMs: Long = 5_000,
    /**
     * The phone must be fairly steady before the push (rejects walking, running, shaking):
     * no sample above [quietThreshold] in the [quietWindowMs] that ends [quietGapMs] before the push.
     */
    val quietWindowMs: Long = 450,
    val quietGapMs: Long = 150,
    val quietThreshold: Float = 12f,
    /** ...and the average motion in that window must stay low (a pocket or a walk is never still). */
    val quietMean: Float = 3.5f,
    /** Low-pass factor for estimating gravity from raw accelerometer data (~100 Hz). */
    val gravityAlpha: Float = 0.97f,
) {
    fun scaled(scale: Float) = copy(pushThreshold = pushThreshold * scale, brakeThreshold = brakeThreshold * scale)
}

class FlickDetector(var config: FlickConfig = FlickConfig()) {
    private data class Sample(val t: Long, val magnitude: Float)

    private val history = ArrayDeque<Sample>()
    private var gravity: FloatArray? = null
    private var firstSampleAt = -1L
    private var lastFiredAt = Long.MIN_VALUE / 2

    private var pushAxis = -1
    private var pushSign = 1f
    private var pushStartedAt = 0L
    private var pushHeldUntil = 0L

    /** Proximity sensor reads "near" (in a pocket or bag, or face against something). */
    var proximityNear: Boolean = false
    /** Latest gravity along the screen normal (+9.8 face up, -9.8 face down). Null if unknown. */
    var gravityZ: Float? = null

    fun reset() {
        history.clear()
        gravity = null
        firstSampleAt = -1L
        pushAxis = -1
    }

    /** Linear acceleration sample (gravity removed). Returns true when a flick completes. */
    fun addLinear(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        val c = config
        val v = floatArrayOf(x, y, z)
        val magnitude = sqrt(x * x + y * y + z * z)

        val quietFrom = tMs - c.quietGapMs - c.quietWindowMs
        val quietTo = tMs - c.quietGapMs
        var sum = 0f
        var n = 0
        var peakOk = true
        for (h in history) {
            if (h.t < quietFrom || h.t >= quietTo) continue
            sum += h.magnitude; n++
            if (h.magnitude >= c.quietThreshold) peakOk = false
        }
        val quietBefore = peakOk && (n == 0 || sum / n < c.quietMean)
        history.addLast(Sample(tMs, magnitude))
        while (history.isNotEmpty() && history.first().t < quietFrom) history.removeFirst()
        if (firstSampleAt < 0) firstSampleAt = tMs
        val warmedUp = tMs - firstSampleAt >= c.quietGapMs + c.quietWindowMs

        if (tMs - lastFiredAt < c.cooldownMs) {
            pushAxis = -1
            return false
        }

        if (pushAxis >= 0) {
            val along = v[pushAxis] * pushSign
            if (tMs - pushStartedAt > c.brakeWindowMs) {
                pushAxis = -1
            } else if (along >= c.pushThreshold * 0.5f) {
                pushHeldUntil = tMs
                return false
            } else if (along <= -c.brakeThreshold) {
                val held = pushHeldUntil - pushStartedAt >= c.minPushMs
                pushAxis = -1
                if (held && !blocked()) {
                    lastFiredAt = tMs
                    return true
                }
                return false
            } else {
                return false
            }
        }

        if (warmedUp && quietBefore && magnitude >= c.pushThreshold) {
            var axis = 0
            for (i in 1..2) if (abs(v[i]) > abs(v[axis])) axis = i
            if (abs(v[axis]) > c.axisDominance * magnitude) {
                pushAxis = axis
                pushSign = if (v[axis] >= 0) 1f else -1f
                pushStartedAt = tMs
                pushHeldUntil = tMs
            }
        }
        return false
    }

    /** Raw accelerometer sample including gravity; gravity is removed with a low-pass filter. */
    fun addWithGravity(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        val a = config.gravityAlpha
        val g = gravity ?: floatArrayOf(x, y, z).also { gravity = it; return false }
        g[0] = a * g[0] + (1 - a) * x
        g[1] = a * g[1] + (1 - a) * y
        g[2] = a * g[2] + (1 - a) * z
        gravityZ = g[2]
        return addLinear(x - g[0], y - g[1], z - g[2], tMs)
    }

    /** In a pocket (proximity near) or lying face down: never a flick. */
    private fun blocked(): Boolean = proximityNear || (gravityZ ?: 0f) < -7f
}
