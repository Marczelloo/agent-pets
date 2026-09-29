import { stepPet, type Pet } from '../renderer';
import type { MotionDef } from './types';

const STEP = 1 / 60;

/**
 * The pet clock follows motion speed (changing motion does not jump phase). Dynamic solves springs
 * in substeps ≤ 1/60 s so stiffer springs remain stable at 10 fps. Returns the clock.
 */
export function tick(c: Pet, dt: number, t0: number, m: MotionDef, animate: boolean): number {
  const prev: number = c.clk ?? t0 - dt * m.tempo;
  const d = dt * m.tempo;
  c.clk = prev + d;
  if (!animate) return c.clk;
  if (c.fx && prev < c.fx.stopUntil) return c.clk; // hit-stop: pet stays still
  if (m.id === 'calm') { stepPet(c, dt, c.clk); return c.clk; }
  const n = Math.max(1, Math.ceil(d / STEP - 1e-9));
  for (let i = 1; i <= n; i++) stepPet(c, d / n, prev + d * i / n, m.spring);
  return c.clk;
}
