import { stepPet, type Pet } from '../renderer';
import type { MotionDef } from './types';

const STEP = 1 / 60;

/**
 * The pet clock follows motion speed (changing motion does not jump phase). Both motions solve springs in
 * substeps ≤ 1/60 s. Calm used one explicit Euler step per frame, which diverges (arms, bubble, pole, tilt
 * jump around) at the 0.1 s frames of power saving. Returns the clock.
 */
export function tick(c: Pet, dt: number, t0: number, m: MotionDef, animate: boolean): number {
  const prev: number = c.clk ?? t0 - dt * m.tempo;
  const d = dt * m.tempo;
  c.clk = prev + d;
  if (!animate) return c.clk;
  if (c.fx && prev < c.fx.stopUntil) return c.clk; // hit-stop: pet stays still
  const n = Math.max(1, Math.ceil(d / STEP - 1e-9));
  for (let i = 1; i <= n; i++) stepPet(c, d / n, prev + d * i / n, m.spring);
  return c.clk;
}
