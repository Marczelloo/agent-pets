import type { MotionId } from '../types';
import type { MotionDef } from './types';
export type { MotionDef } from './types';

export const MOTIONS: Record<MotionId, MotionDef> = {
  calm: { id: 'calm', tempo: 1, spring: { k: 1, d: 1 }, squash: 1, speedLines: false, impacts: false, emotes: false },
  anime: { id: 'anime', tempo: 1.4, spring: { k: 1.8, d: 0.7 }, squash: 1.6, speedLines: true, impacts: true, emotes: true },
};

/** Tryb oszczędny: bez linii prędkości. Wyłączone efekty animacji w Windows: także bez impaktów. */
export function effective(m: MotionDef, env: { saving: boolean; reduced: boolean }): MotionDef {
  if (!env.saving && !env.reduced) return m;
  return { ...m, speedLines: false, impacts: m.impacts && !env.reduced };
}
