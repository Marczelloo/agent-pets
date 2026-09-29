import type { State } from '../types';

const STILL = new Set<State>(['idle', 'sleep', 'done']);

/** Power saving mode (phase 5 spec, 7): 10 fps instead of 30; idle, sleeping, and finished pets stand still. */
export function frameBudget(saving: boolean): { fps: number; animate: (s: State) => boolean } {
  return saving ? { fps: 10, animate: s => !STILL.has(s) } : { fps: 30, animate: () => true };
}

/** Windows "Animation effects: off" → no trails, speed lines, or impacts (appearance spec, 4). */
export function reducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return mm ? mm('(prefers-reduced-motion: reduce)').matches : false;
}
