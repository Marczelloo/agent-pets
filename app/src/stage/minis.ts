// Mini-zwierzaki subagentów (spec 0.8, 3.3): dziecko pracujące od 5 s stoi obok rodzica w rozmiarze 55%.
// (Pierwotnie 20 s; w praktyce za późno. 5 s wystarcza, żeby krótkie wywołania nie migały w pasku.)
import type { Session, StageSettings } from '../types';
import { sceneFor, type SceneKey } from './sceneFor';

export const MINI_AFTER_MS = 5_000, MINI_SCALE = 0.55, MINI_MAX = 3;
/** Pożegnanie mini (machnięcie i zniknięcie); przy błędzie najpierw poza błędu. */
export const MINI_BYE_MS = 1_000, MINI_ERROR_MS = 1_500;

const ACTIVE = new Set(['thinking', 'working', 'compacting']);
const LEAVING = new Set(['done', 'error', 'ended']);

const exitMs = (c: Session) => (c.state === 'error' ? MINI_ERROR_MS : 0) + MINI_BYE_MS;

/** Czy dziecko jest (albo do końca pożegnania było) mini-zwierzakiem. */
function isMini(c: Session, now: number): boolean {
  if (ACTIVE.has(c.state)) return now - c.started_at >= MINI_AFTER_MS;
  return LEAVING.has(c.state) && c.state_since - c.started_at >= MINI_AFTER_MS && now - c.state_since < exitMs(c);
}

const byStart = (a: Session, b: Session) => a.started_at - b.started_at || (a.id < b.id ? -1 : 1);

/** Dzieci widoczne jako mini przy rodzicu: najstarsze trzy i liczba pozostałych. */
export function minisOf(parent: Session, all: Session[], now: number, on: boolean): { shown: Session[]; more: number } {
  if (!on) return { shown: [], more: 0 };
  const minis = all.filter(c => c.parent === parent.id && isMini(c, now)).sort(byStart);
  return { shown: minis.slice(0, MINI_MAX), more: Math.max(0, minis.length - MINI_MAX) };
}

/** Poza mini: jak u dużych, a przy odejściu błąd przez 1,5 s i machnięcie. */
export function miniScene(c: Session, now: number): SceneKey {
  if (c.state === 'error') return now - c.state_since < MINI_ERROR_MS ? 'error' : 'bye';
  if (c.state === 'done' || c.state === 'ended') return 'bye';
  return sceneFor(c);
}

/** Przezroczystość mini: znika w ostatnich 0,4 s pożegnania. */
export function miniAlpha(c: Session, now: number): number {
  if (!LEAVING.has(c.state)) return 1;
  const left = exitMs(c) - (now - c.state_since);
  return Math.max(0, Math.min(1, left / 400));
}

/** Mini stoją w kierunku rośnięcia sceny: po lewej rodzica przy kotwicy z prawej (pasek po prawej, wyrównanie do prawej). */
export function minisLeftOf(st: Pick<StageSettings, 'position' | 'align'>): boolean {
  if (st.position === 'right') return true;
  if (st.position === 'left') return false;
  return st.align !== 'left';
}

/** Rodzic „deleguje”, gdy ma pracujące dziecko bez mini-zwierzaka (młodsze niż 5 s albo mini wyłączone). */
export function delegating(parent: Session, all: Session[], now: number, on: boolean): boolean {
  return all.some(c => c.parent === parent.id && ACTIVE.has(c.state) && (!on || now - c.started_at < MINI_AFTER_MS));
}

/** Poza rodzica: „deleguje” tylko wtedy, gdy nie czeka na Ciebie, nie ma błędu i się nie żegna (delegowanie wygrywa z muzyką). */
export function parentScene(s: Session, all: Session[], now: number, on: boolean, music = false): SceneKey {
  const own = sceneFor(s, music);
  if (own === 'needs' || own === 'error' || own === 'bye') return own;
  return delegating(s, all, now, on) ? 'agent' : own;
}
