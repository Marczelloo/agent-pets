// Narzędzia choreografii Dynamiczny (spec 8.1): klatki kluczowe z szybką akcją i pauzą, zdarzenia w czasie akcji.
export type Pose = Record<string, number | string | null>;

/** Szybka akcja: prawie cała droga w pierwszej ⅓ odcinka, potem zatrzymanie w pozie. */
export const snapE = (v: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, v)), 5);

/** Klatki kluczowe `[czas, poza]`: brakujące klucze przechodzą z poprzedniej klatki; liczby idą `snapE`, reszta przełącza się na początku odcinka do klatki. */
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

/** Raz, gdy czas akcji mija `a0` w tym kroku. */
export const at = (a: number, dt: number, a0: number) => a - dt < a0 && a >= a0;
/** Raz na okres `period`, od `from` (pierwszy raz na starcie). */
export const every = (a: number, dt: number, period: number, from = 0) =>
  a >= from && Math.floor((a - from) / period + 1e-9) !== Math.floor((a - dt - from) / period + 1e-9);

/** Lewa ręka na biodrze (jak w scenach Spokojnych). */
export const HIP = { ikL: 1, hxL: -47, hyL: -25 };
/** Jedyne napisy scen, tylko w kulminacjach (czcionka pikselowa w `motion/fx/glyphs.ts` musi mieć każdy znak). */
export const WORDS = ['BAM!', 'POOF!', 'NICE!', '!'] as const;
