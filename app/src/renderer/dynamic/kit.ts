// Dynamic choreography tools (spec 8.1): keyframes with quick action and pause, timed action events.
export type Pose = Record<string, number | string | null>;

/** Quick action: almost all movement in the first third of the segment, then hold the pose. */
export const snapE = (v: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 5);

/** Keyframes `[time, pose]`: missing keys carry from the previous frame; numbers use `snapE`, others switch at segment start. */
export function keys(F: [number, Pose][]): (a: number) => Pose {
  const R: [number, Pose][] = [];
  let acc: Pose = {};
  for (const [t, p] of F) { acc = { ...acc, ...p }; R.push([t, acc]); }
  return (a) => {
    if (a <= R[0][0]) return { ...R[0][1] };
    for (let i = 1; i < R.length; i++) if (a <= R[i][0]) {
      const [t0, p0] = R[i - 1], [t1, p1] = R[i], e = snapE((a - t0) / (t1 - t0)), o: Pose = {};
      for (const k in p1) { const v0 = p0[k], v1 = p1[k]; o[k] = typeof v1 === 'number' && typeof v0 === 'number' ? v0 + (v1 - v0) * e : v1; }
      return o;
    }
    return { ...R[R.length - 1][1] };
  };
}

/** Once when action time passes `a0` during this step. */
export const at = (a: number, dt: number, a0: number) => a - dt < a0 && a >= a0;
/** Once per `period`, starting at `from` (first time at startup). */
export const every = (a: number, dt: number, period: number, from = 0) =>
  a >= from && Math.floor((a - from) / period + 1e-9) !== Math.floor((a - dt - from) / period + 1e-9);

/** Left hand on hip (as in Calm scenes). */
export const HIP = { ikL: 1, hxL: -47, hyL: -25 };
/** The only scene captions, shown at peaks (pixel font in `motion/fx/glyphs.ts` needs every character). */
export const WORDS = ['BAM!', 'POOF!', 'NICE!', '!'] as const;
