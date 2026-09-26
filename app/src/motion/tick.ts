import { stepPet, type Pet } from '../renderer';
import type { MotionDef } from './types';

const STEP = 1 / 60;

/**
 * Zegar zwierzaka biegnie z tempem ruchu (zmiana ruchu nie robi skoku fazy). Dynamiczny liczy sprężyny
 * w podkrokach ≤ 1/60 s, żeby twardsze sprężyny nie rozjechały się przy 10 kl./s. Zwraca zegar.
 */
export function tick(c: Pet, dt: number, t0: number, m: MotionDef, animate: boolean): number {
  const prev: number = c.clk ?? t0 - dt * m.tempo;
  const d = dt * m.tempo;
  c.clk = prev + d;
  if (!animate) return c.clk;
  if (m.id === 'calm') { stepPet(c, dt, c.clk); return c.clk; }
  const n = Math.max(1, Math.ceil(d / STEP - 1e-9));
  for (let i = 1; i <= n; i++) stepPet(c, d / n, prev + d * i / n, m.spring);
  return c.clk;
}
