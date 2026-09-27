// Wygląd zwierzaka (styl rysowania i ruch): domyślny dla wszystkich i nadpisania per agent. Lustro `Pets` z rdzenia.
import type { AppId, Look, MotionId, Pets, Session, StageSettings, StyleId } from './types';

export const STYLE_IDS: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel'];
export const MOTION_IDS: MotionId[] = ['calm', 'dynamic'];
/** Wygląd bez ustawień: dokładnie rysunek prototypu v6 (testy parytetu). */
export const DEFAULT_LOOK: Look = { style: 'clean', motion: 'calm' };

/** Jak `Pets::default()` w rdzeniu. */
export const defaultPets = (): Pets => ({ style: 'sticker', motion: 'calm', overrides: {}, max_visible: 5, react_to_media: true });

/** Jak `Stage::default()` w rdzeniu: scena przy zasobniku, bez tła, jak w 0.6. */
export const defaultStage = (): StageSettings => ({
  position: 'right', monitor: 'primary', background: { kind: 'none', radius: 12 },
  size: 100, gap: 0, padding: 2, align: 'right', order: 'start', show: { progress: true, limits: true, badge: true },
  bubbles: { questions: true, actions: true }, minis: true,
});

/** Aplikacja, której nadpisanie wyglądu dotyczy sesji; `null` = agent bez własnych ustawień (wygląd domyślny). */
export function appFor(s: Pick<Session, 'agent' | 'origin'>): AppId | null {
  if (s.origin === 'router') return 'agent_router';
  switch (s.agent) {
    case 'claude': return 'claude_code';
    case 'codex': return 'codex';
    case 'opencode': return 'opencode';
    default: return null;
  }
}

/** Ruch „anime” z wcześniejszych wersji to dziś „dynamic” (rdzeń też czyta stary identyfikator). */
const motionOf = (m: MotionId | 'anime'): MotionId => (m === 'anime' ? 'dynamic' : m);

export function lookFor(p: Pets, app: AppId | null): Look {
  const o = (app && p.overrides?.[app]) || {};
  return { style: o.style ?? p.style, motion: motionOf(o.motion ?? p.motion) };
}

/** `null` = „Jak domyślny”: usuwa pole, a puste nadpisanie znika. */
export function withOverride(p: Pets, app: AppId, field: keyof Look, v: StyleId | MotionId | null): Pets {
  const cur: Partial<Look> = { ...(p.overrides?.[app] ?? {}) };
  if (v == null) delete cur[field]; else (cur as Record<string, string>)[field] = v;
  const overrides = { ...(p.overrides ?? {}) };
  if (Object.keys(cur).length) overrides[app] = cur; else delete overrides[app];
  return { ...p, overrides };
}
