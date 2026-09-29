import type { MotionId } from '../types';

/** Motion profile: clock and springs (`tick`); `fx` enables Dynamic choreography and effects (`renderer/dynamic`, `motion/fx`). */
export interface MotionDef {
  id: MotionId;
  /** pet clock multiplier */
  tempo: number;
  /**
   * spring multipliers; `crit` = critically damped, solved analytically (no overshoot);
   * `action` = extra stiffness for actions marked `_stiff` (state transitions remain soft)
   */
  spring: { k: number; d: number; crit?: boolean; action?: number };
  /** squash and stretch multiplier during jumps */
  squash: number;
  fx: boolean;
}

/** Which Dynamic effects this frame allows: action background, flashes, shake, particle fraction (1 or 0.5). */
export interface FxEnv { fx: boolean; bg: boolean; flash: boolean; shake: boolean; parts: number }
