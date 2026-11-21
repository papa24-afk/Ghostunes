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
    val pushThreshold: Float = 7f,
    /** Braking along the opposite direction, m/s². */
    val brakeThreshold: Float = 4.5f,
    /** Braking must arrive within this long after the push starts. */
    val brakeWindowMs: Long = 400,
    /** The push must stay strong this long (rejects impacts like setting it on a table)... */
    val minPushMs: Long = 30,
    /** ...but not longer than this (a flick is short; lifting or carrying is not). */
    val maxPushMs: Long = 180,
    /** A flick stops abruptly: braking must start within this long after the push ends. */
    val brakeGapMs: Long = 150,
    /** Braking must point back along the push: cosine between them ≤ this. */
    val oppositeCos: Float = -0.45f,
    /** No further flicks for this long after one fires. */
    val cooldownMs: Long = 2_500,
    /**
     * Small shake: quick left-right (or back-and-forth) swings, each at least [shakeThreshold],
     * alternating direction. Fires on the [shakeSwings]th swing, so it's instant.
     */
    val shakeThreshold: Float = 6f,
    val shakeSwings: Int = 3,
    /** A swing must start at least this long after the previous one started (rejects impact ringing)... */
    val shakeMinGapMs: Long = 60,
    /** ...and within this long after the previous one ended (rejects walking / slow sways). */
    val shakeMaxGapMs: Long = 320,
    /** Swings of a shake start at least this often (≥ ~1.6 per second); slower is rocking or swaying. */
    val shakeMaxPeriodMs: Long = 320,
    /** A single swing longer than this is a slow movement (picking the phone up), not a shake. */
    val shakeMaxSwingMs: Long = 200,
    /**
     * Shakes don't need the phone held still first (you can pick it up and shake at once, or keep
     * shaking): only nothing violent just before (rules out running / knocks in a pocket).
     */
    val calmPeak: Float = 22f,
    val calmMean: Float = 9f,
    /** Wrist twist back and forth (gyroscope), rad/s per swing. */
    val twistThreshold: Float = 2.5f,
    /**
     * Energy shake (direction-free, like common "shake to..." features): within the last
     * [energyWindowMs], at least half the samples are ≥ [energyThreshold], over ≥ [energyMinSpanMs].
     * Only if the phone was fairly calm just before ([energyCalmMean] over the second before).
     */
    val energyThreshold: Float = 5.5f,
    val energyWindowMs: Long = 500,
    val energyMinSpanMs: Long = 300,
    val energyCalmMean: Float = 5f,
    /**
     * Putting the phone down looks like a flick (push, sudden stop). So a detection only counts if,
     * [confirmMs] later, the phone isn't lying flat and still (on a table)...
     */
    val confirmMs: Long = 300,
    val restMax: Float = 0.8f,
    val flatGravity: Float = 9.0f,
    /** ...and a flick that's mostly straight up or down (putting down, picking up) never counts. */
    val verticalCos: Float = 0.88f,
    /** Lying flat but still settling: wait up to this long for it to come to rest. */
    val settleMaxMs: Long = 700,
    val twistSwings: Int = 3,
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
    fun scaled(scale: Float) = copy(pushThreshold = pushThreshold * scale, brakeThreshold = brakeThreshold * scale, shakeThreshold = shakeThreshold * scale, twistThreshold = twistThreshold * scale, energyThreshold = energyThreshold * scale)
}

class FlickDetector(var config: FlickConfig = FlickConfig()) {
    private data class Sample(val t: Long, val magnitude: Float, val x: Float = 0f, val y: Float = 0f, val z: Float = 0f)

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

    // Shake candidates: moving (linear acceleration) and twisting (gyroscope).
    private val moveSwings = SwingTracker()
    private val twistSwings = SwingTracker()
    /** Nothing violent in the last moment (updated from acceleration samples). */
    private var calm = false
    /** Last ~1.5 s of magnitudes, for the energy shake. */
    private val longHistory = ArrayDeque<Sample>()

    /** Proximity sensor reads "near" (pocket, bag, face). */
    var proximityNear: Boolean = false
    /** Latest gravity along the screen normal (+9.8 face up, -9.8 face down). Null if unknown. */
    var gravityZ: Float? = null
    /** Latest full gravity vector (phone axes), for telling vertical moves apart. Null if unknown. */
    private var gravityVec: FloatArray? = null

    fun setGravity(x: Float, y: Float, z: Float) {
        gravityVec = floatArrayOf(x, y, z)
        gravityZ = z
    }

    // A detection waiting for the "not just put down" check.
    private var pendingAt = -1L
    private var pendingBy = ""

    /** Which detector fired last ("flick", "swing", "energy", "twist"), for the debug screen and tests. */
    var lastFiredBy: String = ""
        private set

    /** Peak of the last push candidate, for the debug screen. */
    var lastPeak: Float = 0f
        private set

    fun reset() {
        history.clear()
        gravity = null
        firstSampleAt = -1L
        pushing = false
        moveSwings.reset()
        twistSwings.reset()
        calm = false
        longHistory.clear()
        pendingAt = -1L
    }

    /** A detector fired: hold it until we know the phone wasn't simply put down. */
    private fun propose(by: String, tMs: Long): Boolean {
        pendingAt = tMs
        pendingBy = by
        pushing = false
        moveSwings.reset()
        twistSwings.reset()
        lastFiredAt = tMs // starts the cooldown so nothing else proposes meanwhile
        return false
    }

    private fun lyingFlat(): Boolean = gravityZ?.let { kotlin.math.abs(it) >= config.flatGravity } ?: false

    /** Lying flat and still for the last moment: it was put on a table, not flicked. */
    private fun restingFlat(tMs: Long): Boolean {
        if (!lyingFlat()) return false
        val recent = history.filter { it.t >= tMs - 200 }
        return recent.isNotEmpty() && recent.all { it.magnitude < config.restMax }
    }

    /** Mostly along gravity (straight up or down). */
    private fun vertical(vx: Float, vy: Float, vz: Float): Boolean {
        val g = gravityVec ?: return false
        val gm = sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2])
        val vm = sqrt(vx * vx + vy * vy + vz * vz)
        if (gm < 1f || vm < 1e-3f) return false
        return kotlin.math.abs((vx * g[0] + vy * g[1] + vz * g[2]) / (gm * vm)) > config.verticalCos
    }

    /** Linear acceleration sample (gravity removed). Returns true when a flick completes. */
    fun addLinear(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        val c = config
        val m = sqrt(x * x + y * y + z * z)

        val quietFrom = tMs - c.quietGapMs - c.quietWindowMs
        val quietTo = tMs - c.quietGapMs
        var sum = 0f
        var n = 0
        var max = 0f
        for (h in history) {
            if (h.t < quietFrom || h.t >= quietTo) continue
            sum += h.magnitude; n++
            if (h.magnitude > max) max = h.magnitude
        }
        val mean = if (n == 0) 0f else sum / n
        val quietBefore = max < c.quietThreshold && mean < c.quietMean
        history.addLast(Sample(tMs, m))
        while (history.isNotEmpty() && history.first().t < quietFrom) history.removeFirst()
        if (firstSampleAt < 0) firstSampleAt = tMs
        val warmedUp = tMs - firstSampleAt >= c.quietGapMs + c.quietWindowMs

        if (pendingAt >= 0) {
            if (tMs - pendingAt < c.confirmMs) return false
            val by = pendingBy
            if (blocked() || restingFlat(tMs)) { pendingAt = -1L; return false } // put down / pocketed: not a transfer
            // Flat (likely on a table) but still settling: give it a moment before deciding.
            if (lyingFlat() && tMs - pendingAt < c.settleMaxMs) return false
            pendingAt = -1L
            lastFiredBy = by
            lastFiredAt = tMs
            return true
        }

        if (tMs - lastFiredAt < c.cooldownMs) {
            pushing = false
            moveSwings.reset()
            twistSwings.reset()
            return false
        }

        calm = warmedUp && max < c.calmPeak && mean < c.calmMean
        if (energyShake(x, y, z, m, tMs) && !blocked()) return propose("energy", tMs)
        if (moveSwings.add(x, y, z, m, tMs, c.shakeThreshold, c.shakeSwings, calm) && !blocked()) return propose("swing", tMs)

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
                if (blocked() || vertical(dir[0], dir[1], dir[2])) return false
                return propose("flick", tMs)
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

    private fun energyShake(x: Float, y: Float, z: Float, m: Float, tMs: Long): Boolean {
        val c = config
        longHistory.addLast(if (m > 0f) Sample(tMs, m, x / m, y / m, z / m) else Sample(tMs, m))
        val keepFrom = tMs - c.energyWindowMs - 1_000
        while (longHistory.isNotEmpty() && longHistory.first().t < keepFrom) longHistory.removeFirst()
        if (longHistory.first().t > keepFrom + 100) return false // not enough history yet
        val windowFrom = tMs - c.energyWindowMs
        var inWindow = 0; var strong = 0; var first = tMs
        var beforeSum = 0f; var beforeN = 0
        // A shake goes back and forth: count direction reversals among the strong samples.
        var reversals = 0
        var rx = 0f; var ry = 0f; var rz = 0f; var hasRef = false
        for (h in longHistory) {
            if (h.t >= windowFrom) {
                inWindow++
                if (h.magnitude >= c.energyThreshold) {
                    strong++; if (h.t < first) first = h.t
                    if (!hasRef) { rx = h.x; ry = h.y; rz = h.z; hasRef = true }
                    else if (h.x * rx + h.y * ry + h.z * rz <= -0.3f) { reversals++; rx = h.x; ry = h.y; rz = h.z }
                }
            } else { beforeSum += h.magnitude; beforeN++ }
        }
        if (strong < 4 || strong * 2 < inWindow || tMs - first < c.energyMinSpanMs || reversals < 2) return false
        return beforeN > 0 && beforeSum / beforeN < c.energyCalmMean
    }

    /** Gyroscope sample (rad/s): a quick wrist twist back and forth also counts as a shake. */
    fun addGyro(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        val c = config
        if (tMs - lastFiredAt < c.cooldownMs) { twistSwings.reset(); return false }
        val w = sqrt(x * x + y * y + z * z)
        if (pendingAt >= 0) return false
        if (twistSwings.add(x, y, z, w, tMs, c.twistThreshold, c.twistSwings, calm) && !blocked()) {
            propose("twist", tMs) // confirmed on a following acceleration sample
        }
        return false
    }

    /** Counts quick swings that alternate direction (left-right-left, or twist-untwist-twist). */
    private inner class SwingTracker {
        private var swings = 0
        private val dir = FloatArray(3)
        private var startedAt = 0L
        private var lastAt = 0L
        /** A too-slow swing: ignore it until it's over. */
        private var spent = false

        fun reset() { swings = 0; spent = false }

        fun add(x: Float, y: Float, z: Float, m: Float, tMs: Long, threshold: Float, needed: Int, canStart: Boolean): Boolean {
            val c = config
            if (swings > 0 && tMs - lastAt > c.shakeMaxGapMs) swings = 0
            if (m < threshold) { spent = false; return false }
            if (spent) return false
            val ux = x / m; val uy = y / m; val uz = z / m
            if (swings == 0) {
                if (!canStart) return false
                swings = 1
                dir[0] = ux; dir[1] = uy; dir[2] = uz
                startedAt = tMs; lastAt = tMs
                return false
            }
            val cos = ux * dir[0] + uy * dir[1] + uz * dir[2]
            when {
                cos > 0.3f -> {
                    lastAt = tMs // same swing continues
                    if (tMs - startedAt > c.shakeMaxSwingMs) { swings = 0; spent = true } // too slow: a movement, not a shake
                }
                cos <= -0.5f && tMs - startedAt > c.shakeMaxPeriodMs -> {
                    // Reversed, but too slowly: start counting again from this swing.
                    swings = if (canStart) 1 else 0
                    dir[0] = ux; dir[1] = uy; dir[2] = uz
                    startedAt = tMs; lastAt = tMs
                }
                cos <= -0.5f && tMs - startedAt >= c.shakeMinGapMs -> {
                    swings++
                    dir[0] = ux; dir[1] = uy; dir[2] = uz
                    startedAt = tMs; lastAt = tMs
                    if (swings >= needed) { swings = 0; return true }
                }
            }
            return false
        }
    }

    /** Raw accelerometer sample including gravity; gravity is removed with a low-pass filter. */
    fun addWithGravity(x: Float, y: Float, z: Float, tMs: Long): Boolean {
        val a = config.gravityAlpha
        val g = gravity ?: floatArrayOf(x, y, z).also { gravity = it; return false }
        g[0] = a * g[0] + (1 - a) * x
        g[1] = a * g[1] + (1 - a) * y
        g[2] = a * g[2] + (1 - a) * z
        gravityZ = g[2]
        gravityVec = floatArrayOf(g[0], g[1], g[2])
        return addLinear(x - g[0], y - g[1], z - g[2], tMs)
    }

    /** In a pocket (proximity near) or lying face down: never a flick. */
    private fun blocked(): Boolean = proximityNear || (gravityZ ?: 0f) < -7f
}
