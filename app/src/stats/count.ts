// Tile counters: from 0 to the value in ~800 ms with gentle easing (spec 0.9, 3.3).
export const COUNT_MS = 800;

/** Counter value after `elapsedMs`; reduced motion or animation end gives exactly `to`. */
export function countUp(to: number, elapsedMs: number, durMs = COUNT_MS, reduced = false): number {
  if (reduced || elapsedMs >= durMs) return to;
  const p = Math.max(0, elapsedMs) / durMs;
  return Math.round(to * (1 - Math.pow(1 - p, 3)));
}
