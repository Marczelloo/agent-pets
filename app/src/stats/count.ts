// Liczniki kafelków: od 0 do wartości w ~800 ms z łagodnym hamowaniem (spec 0.9, 3.3).
export const COUNT_MS = 800;

/** Wartość licznika po `elapsedMs`; ograniczony ruch albo koniec animacji daje dokładnie `to`. */
export function countUp(to: number, elapsedMs: number, durMs = COUNT_MS, reduced = false): number {
  if (reduced || elapsedMs >= durMs) return to;
  const p = Math.max(0, elapsedMs) / durMs;
  return Math.round(to * (1 - Math.pow(1 - p, 3)));
}
