package com.ghosttunes.mobile.handoff

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.random.Random

/**
 * Simulated 100 Hz sensor traces. Linear acceleration (gravity removed) unless a test says otherwise.
 * Each trace is a list of (tMs, x, y, z). Phone axes: x = right, y = up the screen, z = out of the screen.
 */
class FlickDetectorTest {
    private data class S(val t: Long, val x: Float, val y: Float, val z: Float)

    private val dt = 10L
    private val g = 9.81f
    private var rng = Random(7)

    private fun noise(a: Double) = (rng.nextDouble() * 2 - 1) * a
    private fun pulse(t: Long, start: Long, len: Long, peak: Double) = if (t in start until start + len) peak * sin(PI * (t - start) / len) else 0.0

    private fun gen(ms: Long, start: Long = 0, f: (Long) -> DoubleArray): List<S> =
        (0 until ms step dt).map { t -> f(t).let { S(start + t, it[0].toFloat(), it[1].toFloat(), it[2].toFloat()) } }

    private fun still(ms: Long) = gen(ms) { doubleArrayOf(noise(0.25), noise(0.25), noise(0.25)) }

    private fun flick(axis: Int = 1, sign: Int = 1, push: Double = 26.0, brake: Double = 18.0, pushMs: Long = 140) = gen(500) { t ->
        val v = pulse(t, 0, pushMs, push * sign) + pulse(t, pushMs, 160, -brake * sign)
        doubleArrayOf(noise(1.0), noise(1.0), noise(1.0)).also { it[axis] += v }
    }

    private fun walking(ms: Long) = gen(ms) { t ->
        val s = t / 1000.0
        val step = 2 * PI * 1.9 * s
        doubleArrayOf(1.2 * sin(step / 2) + noise(0.6), 3.5 * sin(step) + 2.5 * max(0.0, sin(step * 2)) + noise(0.8), 2.0 * sin(step + 1) + noise(0.8))
    }

    private fun running(ms: Long) = gen(ms) { t ->
        val period = 1000.0 / 2.8
        val phase = t % period
        val vertical = when {
            phase < 60 -> 28 * sin(PI * phase / 60)
            phase < 200 -> -9.0
            else -> 4 * sin(PI * (phase - 200) / (period - 200))
        }
        doubleArrayOf(5 * sin(2 * PI * t / (2 * period)) + noise(1.5), vertical + noise(1.5), 6 * sin(2 * PI * t / period + 1) + noise(1.5))
    }

    private fun pickUp(peak: Double) = gen(900) { t ->
        doubleArrayOf(
            pulse(t, 300, 250, 3.0) + noise(0.5),
            pulse(t, 100, 300, peak) + pulse(t, 400, 350, -peak * 0.8) + noise(0.5),
            pulse(t, 150, 300, peak * 0.6) + pulse(t, 450, 300, -peak * 0.5) + noise(0.5),
        )
    }

    /** Lowered onto a table: gentle descent, then a hard 15 ms impact spike (up to 40 m/s²) with ringing. */
    private fun putOnTable(impact: Double) = gen(900) { t ->
        val lower = pulse(t, 0, 300, -4.0) + pulse(t, 300, 250, 3.0)
        val hit = pulse(t, 560, 15, impact) + pulse(t, 575, 15, -impact * 0.45) + pulse(t, 590, 15, impact * 0.2)
        doubleArrayOf(noise(0.4), noise(0.4), lower + hit + noise(0.4))
    }

    /** Walking with the phone in a trouser pocket: thigh swing plus sharp knocks that look like flicks. */
    private fun pocket(ms: Long) = gen(ms) { t ->
        val s = t / 1000.0
        val swing = 2 * PI * 0.95 * s
        val knock = if (t % 1050 in 300L..450L) pulse(t % 1050, 300, 120, 24.0) + pulse(t % 1050, 420, 30, -14.0) else 0.0
        doubleArrayOf(6 * sin(swing) + noise(1.0), 4 * cos(swing * 2) + knock + noise(1.0), 3 * sin(swing + 0.5) + noise(1.0))
    }

    private fun concat(vararg parts: List<S>): List<S> {
        val out = mutableListOf<S>()
        var offset = 0L
        for (p in parts) {
            if (p.isEmpty()) continue
            val base = p.first().t
            p.forEach { out += it.copy(t = offset + (it.t - base)) }
            offset = out.last().t + dt
        }
        return out
    }

    private fun withGravity(trace: List<S>, gravityAt: (Long) -> FloatArray = { floatArrayOf(0f, 0f, g) }) =
        trace.map { s -> val gr = gravityAt(s.t); s.copy(x = s.x + gr[0], y = s.y + gr[1], z = s.z + gr[2]) }

    private fun count(
        trace: List<S>, raw: Boolean = false, config: FlickConfig = FlickConfig(),
        proximityNear: Boolean = false, gravityZ: Float? = 9.8f,
    ): Int {
        val d = FlickDetector(config)
        d.proximityNear = proximityNear
        if (!raw) d.gravityZ = gravityZ
        return trace.count { if (raw) d.addWithGravity(it.x, it.y, it.z, it.t) else d.addLinear(it.x, it.y, it.z, it.t) }
    }

    // ------------------------------------------------------------------ real flicks

    @Test fun `a deliberate flick fires once`() = assertEquals(1, count(concat(still(1000), flick(), still(1000))))

    @Test fun `flicks on every axis and direction fire`() {
        for (axis in 0..2) for (sign in listOf(1, -1)) {
            assertEquals("axis $axis sign $sign", 1, count(concat(still(800), flick(axis, sign), still(800))))
        }
    }

    @Test fun `a flick with a small backswing (wind-up) still fires`() = assertEquals(1, count(concat(still(800), gen(850) { t ->
        val v = pulse(t, 0, 250, -8.0) + pulse(t, 350, 140, 26.0) + pulse(t, 490, 160, -18.0)
        doubleArrayOf(noise(1.0), v + noise(1.0), noise(1.0))
    }, still(800))))

    @Test fun `a flick fires from raw accelerometer data via the gravity filter`() =
        assertEquals(1, count(withGravity(concat(still(1500), flick(), still(1000))), raw = true))

    @Test fun `short cooldown, then fires again`() {
        assertEquals(1, count(concat(still(800), flick(), still(1200), flick(), still(800))))
        assertEquals(2, count(concat(still(800), flick(), still(3000), flick(), still(800))))
    }

    @Test fun `sensitivity scales the threshold`() {
        val gentle = concat(still(800), flick(push = 7.6, brake = 5.0), still(800))
        assertEquals("high", 1, count(gentle, config = FlickConfig().scaled(0.8f)))
        assertEquals("medium", 1, count(gentle, config = FlickConfig().scaled(1.0f)))
        assertEquals("low", 0, count(gentle, config = FlickConfig().scaled(1.3f)))
    }

    @Test fun `a light everyday flick fires at medium`() =
        assertEquals(1, count(concat(still(800), flick(push = 17.0, brake = 11.0), still(800))))

    // ------------------------------------------------------------------ must not fire

    @Test fun `push without braking does not fire`() =
        assertEquals(0, count(concat(still(800), gen(600) { t -> doubleArrayOf(noise(1.0), pulse(t, 0, 160, 26.0), noise(1.0)) }, still(800))))

    @Test fun `a small flick fires`() = assertEquals(1, count(concat(still(800), flick(push = 12.0, brake = 8.0), still(800))))

    @Test fun `a small shake (quick back and forth) fires once`() = assertEquals(1, count(concat(still(800), gen(700) { t ->
        val v = pulse(t, 0, 110, 13.0) + pulse(t, 110, 110, -12.0) + pulse(t, 220, 110, 12.0) + pulse(t, 330, 110, -11.0)
        doubleArrayOf(noise(0.8), v + noise(0.8), noise(0.8))
    }, still(800))))

    @Test fun `a gentle movement below threshold does not fire`() = assertEquals(0, count(concat(still(800), flick(push = 4.0, brake = 3.0), still(800))))

    @Test fun `a slight flick fires`() = assertEquals(1, count(concat(still(800), flick(push = 8.0, brake = 5.5), still(800))))

    @Test fun `a slight wiggle fires`() = assertEquals(1, count(concat(still(800), wiggle(600, amp = 6.0), still(800))))

    @Test fun `a slight flick right after moving the phone fires`() =
        assertEquals(1, count(concat(still(800), pickUp(6.0), still(150), flick(push = 9.0, brake = 6.0), still(800))))

    @Test fun `a tiny left-right wiggle fires fast`() {
        for (axis in 0..2) {
            val trace = concat(still(800), gen(600) { t ->
                val v = pulse(t, 0, 120, 8.5) + pulse(t, 120, 120, -8.5) + pulse(t, 240, 120, 8.5) + pulse(t, 360, 120, -8.0)
                doubleArrayOf(noise(0.6), noise(0.6), noise(0.6)).also { it[axis] += v }
            }, still(800))
            val d = FlickDetector()
            d.gravityZ = 9.8f
            val firedAt = trace.firstOrNull { d.addLinear(it.x, it.y, it.z, it.t) }?.t
            assertEquals("axis $axis fires", true, firedAt != null)
            // Third swing peaks at ~300 ms into the wiggle (800 ms of still before it).
            assertEquals("axis $axis fast", true, firedAt!! - 800 <= 320)
        }
    }

    private fun wiggle(ms: Long, amp: Double = 8.5, halfMs: Long = 120, axis: Int = 0) = gen(ms) { t ->
        val k = t / halfMs
        val v = pulse(t, k * halfMs, halfMs, if (k % 2 == 0L) amp else -amp)
        doubleArrayOf(noise(0.6), noise(0.6), noise(0.6)).also { it[axis] += v }
    }

    @Test fun `shaking straight after picking the phone up fires`() =
        assertEquals(1, count(concat(still(800), pickUp(9.0), wiggle(600), still(800))))

    @Test fun `keeping on shaking fires (once per cooldown)`() =
        assertEquals(1, count(concat(still(800), wiggle(1800), still(500))))

    /** Linear acceleration stays near zero; gyro (rad/s) carries the twist. */
    private fun countTwist(gyro: (Long) -> DoubleArray, ms: Long, before: Long = 900): Int {
        val d = FlickDetector()
        d.gravityZ = 9.8f
        var fired = 0
        for (t in 0 until before + ms step dt) {
            if (d.addLinear(noise(0.4).toFloat(), noise(0.4).toFloat(), noise(0.4).toFloat(), t)) fired++
            val w = if (t < before) doubleArrayOf(noise(0.1), noise(0.1), noise(0.1)) else gyro(t - before)
            if (d.addGyro(w[0].toFloat(), w[1].toFloat(), w[2].toFloat(), t)) fired++
        }
        return fired
    }

    @Test fun `a quick wrist twist back and forth fires`() {
        for (axis in 0..2) assertEquals("axis $axis", 1, countTwist({ t ->
            val k = t / 130
            doubleArrayOf(noise(0.2), noise(0.2), noise(0.2)).also { it[axis] += pulse(t, k * 130, 130, if (k % 2 == 0L) 6.0 else -6.0) }
        }, 700))
    }

    @Test fun `turning the phone over once does not fire`() =
        assertEquals(0, countTwist({ t -> doubleArrayOf(pulse(t, 0, 350, 7.0), noise(0.2), noise(0.2)) }, 1200))

    @Test fun `twist and back once does not fire`() =
        assertEquals(0, countTwist({ t -> doubleArrayOf(pulse(t, 0, 130, 6.0) + pulse(t, 130, 130, -6.0), noise(0.2), noise(0.2)) }, 1200))

    @Test fun `slow rocking does not fire`() =
        assertEquals(0, countTwist({ t -> doubleArrayOf(5.0 * sin(2 * PI * t / 1000.0), noise(0.2), noise(0.2)) }, 4000))

    /** A real hand shake: the phone turns as it moves, so each swing points a different way. */
    private fun messyShake(ms: Long, amp: Double = 14.0) = gen(ms) { t ->
        val k = t / 110
        val v = pulse(t, k * 110, 110, if (k % 2 == 0L) amp else -amp)
        val a = k * 0.9
        doubleArrayOf(v * cos(a) + noise(1.5), v * sin(a) + noise(1.5), v * 0.4 + noise(1.5))
    }

    @Test fun `a messy real-world shake fires within half a second`() {
        val d = FlickDetector()
        d.gravityZ = 9.8f
        val trace = concat(still(1500), messyShake(1200), still(800))
        val firedAt = trace.firstOrNull { d.addLinear(it.x, it.y, it.z, it.t) }?.t
        assertEquals(true, firedAt != null && firedAt - 1500 <= 500)
    }

    @Test fun `a messy shake fires once from raw accelerometer data`() =
        assertEquals(1, count(withGravity(concat(still(1500), messyShake(1200), still(800))), raw = true))

    @Test fun `a slow sway does not fire`() = assertEquals(0, count(concat(still(800), gen(2400) { t ->
        doubleArrayOf(noise(0.6), 7.5 * sin(2 * PI * t / 1200.0) + noise(0.6), noise(0.6))
    }, still(800))))

    @Test fun `a diagonal flick (phone held tilted) fires`() = assertEquals(1, count(concat(still(800), gen(500) { t ->
        val v = pulse(t, 0, 140, 16.0) + pulse(t, 140, 160, -11.0)
        doubleArrayOf(v, v * 0.95, v * 0.45)
    }, still(800))))

    @Test fun `push then a sideways jolt (not back along the push) does not fire`() = assertEquals(0, count(concat(still(800), gen(500) { t ->
        doubleArrayOf(pulse(t, 140, 160, -14.0) + 0.0, pulse(t, 0, 140, 22.0), noise(0.5))
    }, still(800))))

    @Test fun `late braking does not fire`() = assertEquals(0, count(concat(still(800), gen(900) { t ->
        doubleArrayOf(noise(1.0), pulse(t, 0, 120, 25.0) + pulse(t, 450, 150, -18.0), noise(1.0))
    }, still(800))))

    @Test fun `walking for 60s never fires`() {
        assertEquals(0, count(walking(60_000)))
        assertEquals(0, count(withGravity(walking(60_000)), raw = true))
    }

    @Test fun `running for 60s never fires`() {
        assertEquals(0, count(running(60_000)))
        assertEquals(0, count(withGravity(running(60_000)), raw = true))
    }

    @Test fun `picking the phone up never fires`() {
        for (peak in listOf(6.0, 9.0, 12.0, 15.0)) assertEquals("peak $peak", 0, count(concat(still(800), pickUp(peak), still(800))))
    }

    @Test fun `picking up off a table while rotating never fires on raw data`() {
        val trace = concat(still(1500), pickUp(12.0), still(1500))
        val tilted = withGravity(trace) { t ->
            val p = ((t - 1600) / 450f).coerceIn(0f, 1f)
            val a = p * 70f * PI.toFloat() / 180f
            floatArrayOf(0f, g * sin(a), g * cos(a))
        }
        assertEquals(0, count(tilted, raw = true))
    }

    @Test fun `putting the phone on a table never fires`() {
        for (impact in listOf(20.0, 30.0, 40.0)) assertEquals("impact $impact", 0, count(concat(still(800), putOnTable(impact), still(800))))
    }

    @Test fun `dropping it face down on a table never fires`() =
        assertEquals(0, count(concat(still(800), flick(axis = 2, sign = -1), still(800)), gravityZ = -9.8f))

    @Test fun `in a pocket with proximity near never fires`() = assertEquals(0, count(pocket(60_000), proximityNear = true))

    @Test fun `in a pocket without a proximity sensor still never fires`() = assertEquals(0, count(pocket(60_000), proximityNear = false, gravityZ = null))

    @Test fun `motion that starts immediately (no history) does not fire`() = assertEquals(0, count(flick()))

    @Test fun `robust across random noise seeds`() {
        for (seed in 1..20) {
            rng = Random(seed)
            assertEquals("walk seed $seed", 0, count(walking(20_000)))
            assertEquals("run seed $seed", 0, count(running(20_000)))
            assertEquals("pocket seed $seed", 0, count(pocket(20_000)))
            assertEquals("flick seed $seed", 1, count(concat(still(900), flick(), still(900))))
        }
    }
}
