package com.ghosttunes.mobile.handoff

import kotlin.math.sqrt

/**
 * "Flick to PC": a short, sharp push of the phone in any direction, then an abrupt stop
 * (braking along the opposite direction). Pure Kotlin so it's tested on the JVM with
 * simulated sensor traces.
 *
 * Direction-based: you hold the phone tilted, so a flick toward the PC is usually diagonal
 * relative to the phone's own axes. The push direction is measured, and braking must be
 * along the opposite direction.
 */
data class FlickConfig(
    /** Peak linear acceleration of the push, m/s². */
    val pushThreshold: Float = 15f,
    /** Braking along the opposite direction, m/s². */
    val brakeThreshold: Float = 9f,
    /** Braking must arrive within this long after the push starts. */
    val brakeWindowMs: Long = 400,
    /** The push must stay strong this long (rejects impacts like setting it on a table)... */
    val minPushMs: Long = 30,
    /** ...but not longer than this (a flick is short; lifting or carrying is not). */
    val maxPushMs: Long = 260,
    /** A flick stops abruptly: braking must start within this long after the push ends. */
    val brakeGapMs: Long = 110,
    /** Braking must point back along the push: cosine between them ≤ this. */
    val oppositeCos: Float = -0.6f,
    /** No further flicks for this long after one fires. */
    val cooldownMs: Long = 5_000,
    /**
     * The phone must be fairly steady before the push (rejects walking, running, pockets):
     * in the [quietWindowMs] ending [quietGapMs] before the push, no sample above
     * [quietThreshold] and an average below [quietMean].
     */
    val quietWindowMs: Long = 450,
    val quietGapMs: Long = 150,
    val quietThreshold: Float = 14f,
    val quietMean: Float = 4.5f,
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

    // Current push candidate.
    private var pushing = false
    private var pushStartedAt = 0L
    private var pushEndedAt = -1L
    private val dir = FloatArray(3)
    private var peak = 0f

    /** Proximity sensor reads "near" (pocket, bag, face). */
    var proximityNear: Boolean = false
    /** Latest gravity along the screen normal (+9.8 face up, -9.8 face down). Null if unknown. */
    var gravityZ: Float? = null

    /** Peak of the last push candidate, for the debug screen. */
    var lastPeak: Float = 0f
        private set

    fun reset() {
        history.clear()
        gravity = null
        firstSampleAt = -1L
        pushing = false
    }

    /** Linear acceleration sample (gravity removed). Returns true when a flick completes. */
    fun addLinear(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        val c = config
        val m = sqrt(x * x + y * y + z * z)

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
        history.addLast(Sample(tMs, m))
        while (history.isNotEmpty() && history.first().t < quietFrom) history.removeFirst()
        if (firstSampleAt < 0) firstSampleAt = tMs
        val warmedUp = tMs - firstSampleAt >= c.quietGapMs + c.quietWindowMs

        if (tMs - lastFiredAt < c.cooldownMs) {
            pushing = false
            return false
        }

        if (pushing) {
            if (tMs - pushStartedAt > c.brakeWindowMs) {
                pushing = false
                return false
            }
            val along = if (m > 0f) (x * dir[0] + y * dir[1] + z * dir[2]) else 0f
            if (pushEndedAt < 0) {
                if (along >= c.pushThreshold * 0.5f) {
                    // Still pushing: refine the direction toward the strongest part of the push.
                    if (m > peak) {
                        peak = m; lastPeak = m
                        dir[0] = x / m; dir[1] = y / m; dir[2] = z / m
                    }
                    if (tMs - pushStartedAt > c.maxPushMs) pushing = false
                    return false
                }
                pushEndedAt = tMs
                if (pushEndedAt - pushStartedAt < c.minPushMs) {
                    pushing = false
                    return false
                }
            }
            // Braking: soon after the push, strong, and pointing back along it.
            if (tMs - pushEndedAt > c.brakeGapMs) {
                pushing = false
                return false
            }
            if (along <= -c.brakeThreshold && m > 0f && along / m <= c.oppositeCos) {
                pushing = false
                if (blocked()) return false
                lastFiredAt = tMs
                return true
            }
            return false
        }

        if (warmedUp && quietBefore && m >= c.pushThreshold) {
            pushing = true
            pushStartedAt = tMs
            pushEndedAt = -1L
            peak = m; lastPeak = m
            dir[0] = x / m; dir[1] = y / m; dir[2] = z / m
            // Count the ramp-up: the push really began when it crossed half the threshold.
            val rampStart = history.reversed().drop(1).takeWhile { it.magnitude >= c.pushThreshold * 0.5f }.lastOrNull()?.t
            if (rampStart != null) pushStartedAt = rampStart
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
