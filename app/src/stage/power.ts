import type { State } from '../types';

const STILL = new Set<State>(['idle', 'sleep', 'done']);

/** Tryb oszczędny (spec fazy 5, 7): 10 kl./s zamiast 30, a zwierzaki bezczynne, śpiące i po robocie stoją. */
export function frameBudget(saving: boolean): { fps: number; animate: (s: State) => boolean } {
  return saving ? { fps: 10, animate: s => !STILL.has(s) } : { fps: 30, animate: () => true };
}

/** Windows „Efekty animacji: wyłączone” → bez smug, linii prędkości i impaktów (spec wyglądu, 4). */
export function reducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  return mm ? mm('(prefers-reduced-motion: reduce)').matches : false;
}
