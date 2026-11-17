// Simulates phone motion and checks that only a deliberate flick triggers "Flick to PC".
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../src/services/gestureService.ts'), 'utf8');
const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { FlickDetector } = mod.exports;

const HZ = 60;
const DT = 1000 / HZ;
const G = 9.81;

// Deterministic noise so the test never flakes.
let seed = 42;
const noise = (amp) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return ((seed / 2147483648) * 2 - 1) * amp;
};

/** Builds samples from fn(tMs) -> [x, y, z] linear acceleration. */
function generate(durationMs, fn, startMs = 0) {
  const out = [];
  for (let t = startMs; t < startMs + durationMs; t += DT) out.push({ t, a: fn(t - startMs) });
  return out;
}

const still = (ms, start) => generate(ms, () => [noise(0.3), noise(0.3), noise(0.3)], start);

/** Smooth half-sine pulse of the given peak on one axis. */
const pulse = (t, start, length, peak) => (t >= start && t < start + length ? peak * Math.sin((Math.PI * (t - start)) / length) : 0);

function flick(start, { axis = 1, sign = 1, push = 26, brake = 18 } = {}) {
  return generate(500, (t) => {
    const v = pulse(t, 0, 140, push * sign) + pulse(t, 140, 160, -brake * sign);
    const a = [noise(1), noise(1), noise(1)];
    a[axis] += v;
    return a;
  }, start);
}

function walking(ms, start = 0) {
  // ~1.9 steps/s: vertical bounce, forward surge, side sway, with heel-strike bumps.
  return generate(ms, (t) => {
    const s = t / 1000;
    const step = 2 * Math.PI * 1.9 * s;
    return [
      1.2 * Math.sin(step / 2) + noise(0.6),
      3.5 * Math.sin(step) + 2.5 * Math.max(0, Math.sin(step * 2)) + noise(0.8),
      2.0 * Math.sin(step + 1) + noise(0.8),
    ];
  }, start);
}

function running(ms, start = 0) {
  // ~2.8 steps/s: big foot-strike spikes (25-30 m/s²), free-fall in between, strong sway.
  const period = 1000 / 2.8;
  return generate(ms, (t) => {
    const phase = t % period;
    let vertical;
    if (phase < 60) vertical = 28 * Math.sin((Math.PI * phase) / 60); // impact
    else if (phase < 200) vertical = -9.0; // flight phase (near free fall)
    else vertical = 4 * Math.sin((Math.PI * (phase - 200)) / (period - 200));
    return [
      5 * Math.sin((2 * Math.PI * t) / (2 * period)) + noise(1.5),
      vertical + noise(1.5),
      6 * Math.sin((2 * Math.PI * t) / period + 1) + noise(1.5),
    ];
  }, start);
}

function pickUp(start = 0, peak = 9) {
  // Lift off the table (up), slow down, bring towards the face.
  return generate(900, (t) => [
    pulse(t, 300, 250, 3) + noise(0.5),
    pulse(t, 100, 300, peak) + pulse(t, 400, 350, -peak * 0.8) + noise(0.5),
    pulse(t, 150, 300, peak * 0.6) + pulse(t, 450, 300, -peak * 0.5) + noise(0.5),
  ], start);
}

function concat(...parts) {
  const out = [];
  let offset = 0;
  for (const part of parts) {
    const base = part.length ? part[0].t : 0;
    for (const s of part) out.push({ t: offset + (s.t - base), a: s.a });
    offset = out.length ? out[out.length - 1].t + DT : offset;
  }
  return out;
}

/** Converts linear samples into accelerationIncludingGravity with gravity on an orientation track. */
function withGravity(samples, gravityAt = () => [0, 0, G]) {
  return samples.map(({ t, a }) => {
    const g = gravityAt(t);
    return { t, a: [a[0] + g[0], a[1] + g[1], a[2] + g[2]] };
  });
}

function countFlicks(samples, mode = 'linear') {
  const detector = new FlickDetector();
  let fires = 0;
  for (const { t, a } of samples) {
    const fired = mode === 'linear' ? detector.addLinear(a[0], a[1], a[2], t) : detector.addWithGravity(a[0], a[1], a[2], t);
    if (fired) fires += 1;
  }
  return fires;
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('a deliberate flick fires once', () => {
  assert.equal(countFlicks(concat(still(1000), flick(0), still(1000))), 1);
});

test('flicks in either direction on any axis fire', () => {
  for (const axis of [0, 1, 2]) for (const sign of [1, -1])
    assert.equal(countFlicks(concat(still(800), flick(0, { axis, sign }), still(800))), 1, `axis ${axis} sign ${sign}`);
});

test('a flick fires via accelerationIncludingGravity (high-pass path)', () => {
  assert.equal(countFlicks(withGravity(concat(still(1500), flick(0), still(1000))), 'gravity'), 1);
});

test('5s cooldown: a second flick 2s later is ignored, one 6s later fires', () => {
  assert.equal(countFlicks(concat(still(800), flick(0), still(1500), flick(0), still(800))), 1);
  assert.equal(countFlicks(concat(still(800), flick(0), still(5600), flick(0), still(800))), 2);
});

test('a push without braking does not fire', () => {
  const pushOnly = generate(600, (t) => [noise(1), pulse(t, 0, 160, 26) + noise(1), noise(1)]);
  assert.equal(countFlicks(concat(still(800), pushOnly, still(1000))), 0);
});

test('a weak flick (below 19 m/s²) does not fire', () => {
  assert.equal(countFlicks(concat(still(800), flick(0, { push: 16 }), still(800))), 0);
});

test('a diagonal push (no axis above 70% of the magnitude) does not fire', () => {
  const diagonal = generate(500, (t) => {
    const v = pulse(t, 0, 140, 22) + pulse(t, 140, 160, -16);
    return [v, v * 0.95, v * 0.45]; // dominant axis ≈ 68% of the magnitude
  });
  assert.equal(countFlicks(concat(still(800), diagonal, still(800))), 0);
});

test('braking after 380ms does not fire', () => {
  const slow = generate(900, (t) => [noise(1), pulse(t, 0, 120, 25) + pulse(t, 450, 150, -18) + noise(1), noise(1)]);
  assert.equal(countFlicks(concat(still(800), slow, still(800))), 0);
});

test('walking for 60s never fires', () => {
  assert.equal(countFlicks(walking(60000)), 0);
  assert.equal(countFlicks(withGravity(walking(60000)), 'gravity'), 0);
});

test('running for 60s never fires', () => {
  assert.equal(countFlicks(running(60000)), 0);
  assert.equal(countFlicks(withGravity(running(60000)), 'gravity'), 0);
});

test('motion that starts at once (no steady history yet) does not fire', () => {
  assert.equal(countFlicks(flick(0)), 0);
});

test('picking the phone up never fires', () => {
  for (const peak of [6, 9, 12, 15]) {
    assert.equal(countFlicks(concat(still(800), pickUp(0, peak), still(800))), 0, `peak ${peak}`);
  }
});

test('picking the phone up off a table (rotating ~70°) never fires on the gravity path', () => {
  const samples = concat(still(1500), pickUp(0, 12), still(1500));
  const start = 1500;
  const rotate = (t) => {
    const p = Math.min(1, Math.max(0, (t - start - 100) / 450));
    const angle = (p * 70 * Math.PI) / 180; // lying flat -> tilted towards the face
    return [0, G * Math.sin(angle), G * Math.cos(angle)];
  };
  assert.equal(countFlicks(withGravity(samples, rotate), 'gravity'), 0);
});

let failed = 0;
for (const { name, fn } of cases) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}
if (failed) {
  console.error(`flick-gesture: ${failed} of ${cases.length} failed`);
  process.exit(1);
}
console.log(`flick-gesture: ${cases.length} passed`);
