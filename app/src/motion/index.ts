import type { MotionId } from '../types';
import type { FxEnv, MotionDef } from './types';
export type { FxEnv, MotionDef } from './types';

export const MOTIONS: Record<MotionId, MotionDef> = {
  calm: { id: 'calm', tempo: 1, spring: { k: 1, d: 1 }, squash: 1, fx: false },
  dynamic: { id: 'dynamic', tempo: 1, spring: { k: 1, d: 1, crit: true, action: 2.5 }, squash: 1.6, fx: true },
};

/** Low-power mode: half the particles, no action background. Windows animation effects disabled: no flashes or shakes (spec 8.2). */
export function effective(m: MotionDef, env: { saving: boolean; reduced: boolean }): FxEnv {
  return { fx: m.fx, bg: m.fx && !env.saving, flash: m.fx && !env.reduced, shake: m.fx && !env.reduced, parts: env.saving ? 0.5 : 1 };
}
