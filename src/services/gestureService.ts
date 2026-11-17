// src/services/gestureService.ts
// "Flick to PC": a sharp push of the phone followed by braking in the opposite direction.
// The detector is pure (no DOM) so tests/flick-gesture.cjs can drive it with simulated motion.

export const FLICK_SETTING_KEY = 'ghosttunes_flick_handoff';
const FLICK_SETTING_EVENT = 'ghosttunes:flick-setting';

export const FLICK_CONFIG = {
  /** Minimum linear acceleration of the push, m/s². */
  pushThreshold: 19,
  /** Share of the push's magnitude that must lie on a single axis. */
  axisDominance: 0.7,
  /** Braking (opposite direction on the same axis) must start within this window, ms. */
  brakeWindowMs: 380,
  /** Minimum braking acceleration, m/s². */
  brakeThreshold: 11,
  /** Ignore further flicks for this long after one fires, ms. */
  cooldownMs: 5000,
  /**
   * The phone must be fairly steady before the push (rules out walking, running and shaking):
   * no sample above quietThreshold in the quietWindowMs that ends quietGapMs before the push
   * (the gap leaves room for the push's own ramp-up).
   */
  quietWindowMs: 450,
  quietGapMs: 150,
  quietThreshold: 12,
  /** Low-pass factor used to estimate gravity when only accelerationIncludingGravity is available. */
  gravityAlpha: 0.95,
};

type Axis = 0 | 1 | 2;

export class FlickDetector {
  private gravity: [number, number, number] | null = null;
  private history: { t: number; magnitude: number }[] = [];
  private push: { axis: Axis; sign: 1 | -1; startedAt: number } | null = null;
  private lastFiredAt = -Infinity;
  private firstSampleAt: number | null = null;

  constructor(private config = FLICK_CONFIG) {}

  reset() {
    this.gravity = null;
    this.history = [];
    this.push = null;
    this.firstSampleAt = null;
  }

  /** Linear acceleration sample (gravity already removed). Returns true when a flick completes. */
  addLinear(x: number, y: number, z: number, t: number): boolean {
    const c = this.config;
    const values = [x, y, z];
    const magnitude = Math.hypot(x, y, z);

    // Was the phone steady in the window before this sample?
    const quietFrom = t - c.quietGapMs - c.quietWindowMs;
    const quietTo = t - c.quietGapMs;
    const quietBefore = this.history.every(sample => sample.t < quietFrom || sample.t >= quietTo || sample.magnitude < c.quietThreshold);
    this.history.push({ t, magnitude });
    while (this.history.length && this.history[0].t < quietFrom) this.history.shift();
    if (this.firstSampleAt === null) this.firstSampleAt = t;
    // Without a full quiet window of history we can't tell a flick from the first stride of a run.
    const warmedUp = t - this.firstSampleAt >= c.quietGapMs + c.quietWindowMs;

    if (t - this.lastFiredAt < c.cooldownMs) {
      this.push = null;
      return false;
    }

    if (this.push) {
      const along = values[this.push.axis] * this.push.sign;
      if (t - this.push.startedAt > c.brakeWindowMs) {
        this.push = null;
      } else if (along <= -c.brakeThreshold) {
        this.push = null;
        this.lastFiredAt = t;
        return true;
      } else {
        return false;
      }
    }

    if (warmedUp && magnitude >= c.pushThreshold && quietBefore) {
      let axis: Axis = 0;
      for (const i of [1, 2] as Axis[]) if (Math.abs(values[i]) > Math.abs(values[axis])) axis = i;
      if (Math.abs(values[axis]) > c.axisDominance * magnitude) {
        this.push = { axis, sign: values[axis] >= 0 ? 1 : -1, startedAt: t };
      }
    }
    return false;
  }

  /** Raw accelerometer sample including gravity; gravity is removed with a low-pass filter. */
  addWithGravity(x: number, y: number, z: number, t: number): boolean {
    const a = this.config.gravityAlpha;
    if (!this.gravity) {
      this.gravity = [x, y, z];
      return false;
    }
    const g = this.gravity;
    g[0] = a * g[0] + (1 - a) * x;
    g[1] = a * g[1] + (1 - a) * y;
    g[2] = a * g[2] + (1 - a) * z;
    return this.addLinear(x - g[0], y - g[1], z - g[2], t);
  }
}

export function isFlickHandoffEnabled(): boolean {
  try {
    return localStorage.getItem(FLICK_SETTING_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setFlickHandoffEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FLICK_SETTING_KEY, String(enabled));
  } catch {}
  window.dispatchEvent(new CustomEvent(FLICK_SETTING_EVENT, { detail: enabled }));
}

export function subscribeFlickSetting(callback: (enabled: boolean) => void): () => void {
  const handler = (event: Event) => callback(Boolean((event as CustomEvent).detail));
  window.addEventListener(FLICK_SETTING_EVENT, handler);
  return () => window.removeEventListener(FLICK_SETTING_EVENT, handler);
}

/** Listens to device motion and calls onFlick when the phone is flicked (only while the app is visible). */
export function startFlickGesture(onFlick: () => void): () => void {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return () => {};
  const detector = new FlickDetector();

  const handler = (event: DeviceMotionEvent) => {
    if (document.visibilityState !== 'visible') {
      detector.reset();
      return;
    }
    const t = event.timeStamp || performance.now();
    const linear = event.acceleration;
    let fired = false;
    if (linear && linear.x != null && linear.y != null && linear.z != null) {
      fired = detector.addLinear(linear.x, linear.y, linear.z, t);
    } else {
      const raw = event.accelerationIncludingGravity;
      if (!raw || raw.x == null || raw.y == null || raw.z == null) return;
      fired = detector.addWithGravity(raw.x, raw.y, raw.z, t);
    }
    if (fired) {
      try {
        navigator.vibrate?.(35);
      } catch {}
      onFlick();
    }
  };

  const onVisibility = () => detector.reset();
  window.addEventListener('devicemotion', handler);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('devicemotion', handler);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
