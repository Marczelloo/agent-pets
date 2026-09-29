// Subagent mini pets (spec 0.8, 3.3): a child working for 5 s stands beside its parent at 55% size.
// (Originally 20 s; too late in practice. 5 s keeps short calls from flashing in the taskbar.)
import type { Session, StageSettings } from '../types';
import { sceneFor, type SceneKey } from './sceneFor';

export const MINI_AFTER_MS = 5_000, MINI_SCALE = 0.55, MINI_MAX = 3;
/** Mini farewell (wave and disappear); on error, show the error pose first. */
export const MINI_BYE_MS = 1_000, MINI_ERROR_MS = 1_500;

const ACTIVE = new Set(['thinking', 'working', 'compacting']);
const LEAVING = new Set(['done', 'error', 'ended']);

const exitMs = (c: Session) => (c.state === 'error' ? MINI_ERROR_MS : 0) + MINI_BYE_MS;

/** Whether the child is a mini pet (or was one until its farewell ended). */
function isMini(c: Session, now: number): boolean {
  if (ACTIVE.has(c.state)) return now - c.started_at >= MINI_AFTER_MS;
  return LEAVING.has(c.state) && c.state_since - c.started_at >= MINI_AFTER_MS && now - c.state_since < exitMs(c);
}

const byStart = (a: Session, b: Session) => a.started_at - b.started_at || (a.id < b.id ? -1 : 1);

/** Children visible as minis beside the parent: the three oldest and a count of the rest. */
export function minisOf(parent: Session, all: Session[], now: number, on: boolean): { shown: Session[]; more: number } {
  if (!on) return { shown: [], more: 0 };
  const minis = all.filter(c => c.parent === parent.id && isMini(c, now)).sort(byStart);
  return { shown: minis.slice(0, MINI_MAX), more: Math.max(0, minis.length - MINI_MAX) };
}

/** Mini pose: like larger pets; on departure show an error for 1.5 s, then a wave. */
export function miniScene(c: Session, now: number): SceneKey {
  if (c.state === 'error') return now - c.state_since < MINI_ERROR_MS ? 'error' : 'bye';
  if (c.state === 'done' || c.state === 'ended') return 'bye';
  return sceneFor(c);
}

/** Mini opacity: fades during the last 0.4 s of the farewell. */
export function miniAlpha(c: Session, now: number): number {
  if (!LEAVING.has(c.state)) return 1;
  const left = exitMs(c) - (now - c.state_since);
  return Math.max(0, Math.min(1, left / 400));
}

/** Minis stand in the stage growth direction: left of the parent with a right anchor (right taskbar, right alignment). */
export function minisLeftOf(st: Pick<StageSettings, 'position' | 'align'>): boolean {
  if (st.position === 'right') return true;
  if (st.position === 'left') return false;
  return st.align !== 'left';
}

/** Parent delegates when a working child has no mini pet (under 5 s old or minis disabled). */
export function delegating(parent: Session, all: Session[], now: number, on: boolean): boolean {
  return all.some(c => c.parent === parent.id && ACTIVE.has(c.state) && (!on || now - c.started_at < MINI_AFTER_MS));
}

/** Parent pose: delegates only if not waiting for you, in error, or saying goodbye (delegation takes priority over music). */
export function parentScene(s: Session, all: Session[], now: number, on: boolean, music = false): SceneKey {
  const own = sceneFor(s, music);
  if (own === 'needs' || own === 'error' || own === 'bye') return own;
  return delegating(s, all, now, on) ? 'agent' : own;
}
