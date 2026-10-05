import type { State } from '../types';
import type { SceneKey } from './sceneFor';

const STILL = new Set<State>(['idle', 'sleep', 'done']);

/** Power saving mode (phase 5 spec, 7): 10 fps instead of 30; idle, sleeping, and finished pets stand still. */
export function frameBudget(saving: boolean): { fps: number; animate: (s: State) => boolean } {
  return saving ? { fps: 10, animate: s => !STILL.has(s) } : { fps: 30, animate: () => true };
}

/** Scenes that move slowly enough for fewer frames: breathing, snoring, dozing with headphones. */
const CALM = new Set<SceneKey>(['idle', 'sleep', 'doze']);

/**
 * Frame rate for what is on stage (the GPU cost of the widget is mostly frames): anything busy, or a change in the
 * last few seconds (entrances, scene switches), gets the full rate; calm pets 20 fps, only sleepers 10, an empty
 * stage (badge and limit bars only) 4.
 */
export function stageFps(base: number, scenes: SceneKey[], hot: boolean): number {
  if (hot || scenes.some(s => !CALM.has(s))) return base;
  if (scenes.length === 0) return 4;
  return Math.min(base, scenes.every(s => s !== 'idle') ? 10 : 20);
}

/** Windows "Animation effects: off" → no trails, speed lines, or impacts (appearance spec, 4). */
export function reducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return mm ? mm('(prefers-reduced-motion: reduce)').matches : false;
}
