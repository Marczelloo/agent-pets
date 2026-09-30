// Small math and easing helpers shared by the whole video.

export type Vec = [number, number];
export type Ease = (t: number) => number;

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before `a`, 1 after `b`, linear between. */
export const remap = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export const linear: Ease = t => t;
export const easeIn: Ease = t => t * t * t;
export const easeOut: Ease = t => 1 - Math.pow(1 - t, 3);
export const easeInOut: Ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuint: Ease = t => 1 - Math.pow(1 - t, 5);
export const easeOutBack = (t: number, s = 1.70158): number => { const c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); };
export const easeOutElastic: Ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1);
export const easeOutBounce: Ease = t => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** Damped oscillation that starts at `amp` and rings out: hits, landings, wobbling towers. */
export const ring = (age: number, amp: number, freq: number, decay: number): number => (age < 0 ? 0 : amp * Math.exp(-decay * age) * Math.cos(2 * Math.PI * freq * age));

/** Piecewise track through [time, value, ease?] keys; the ease of the destination key shapes the segment. */
export function track(keys: [number, number, Ease?][]): (t: number) => number {
  return t => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i];
        return lerp(v0, v1, (e ?? easeInOut)((t - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}

/** Deterministic PRNG (mulberry32) for the video's own randomness; the pet renderer has its own seeded one. */
export function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash noise in [0, 1) from a number, for jitter that must not depend on call order. */
export const hash = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export const TAU = Math.PI * 2;
