// Wygląd zwierzaka (styl rysowania i ruch): domyślny dla wszystkich i nadpisania per agent. Lustro `Pets` z rdzenia.
import type { AppId, Look, MotionId, Pets, Session, StyleId } from './types';

export const STYLE_IDS: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel'];
export const MOTION_IDS: MotionId[] = ['calm', 'anime'];
export const STYLE_LABEL: Record<StyleId, string> = {
  sticker: 'Naklejka', sketch: 'Szkic', clean: 'Czysty', pixel: 'Pixel-art', neon: 'Neon', ink: 'Tusz', pastel: 'Pastel',
};
export const MOTION_LABEL: Record<MotionId, string> = { calm: 'Spokojny', anime: 'Anime' };
/** Wygląd bez ustawień: dokładnie rysunek prototypu v6 (testy parytetu). */
export const DEFAULT_LOOK: Look = { style: 'clean', motion: 'calm' };

/** Jak `Pets::default()` w rdzeniu. */
export const defaultPets = (): Pets => ({ style: 'sticker', motion: 'calm', overrides: {}, max_visible: 5 });

export function appFor(s: Pick<Session, 'agent' | 'origin'>): AppId {
  if (s.origin === 'router') return 'agent_router';
  return s.agent === 'codex' ? 'codex' : 'claude_code';
}

export function lookFor(p: Pets, app: AppId): Look {
  const o = p.overrides?.[app] ?? {};
  return { style: o.style ?? p.style, motion: o.motion ?? p.motion };
}

/** `null` = „Jak domyślny”: usuwa pole, a puste nadpisanie znika. */
export function withOverride(p: Pets, app: AppId, field: keyof Look, v: StyleId | MotionId | null): Pets {
  const cur: Partial<Look> = { ...(p.overrides?.[app] ?? {}) };
  if (v == null) delete cur[field]; else (cur as Record<string, string>)[field] = v;
  const overrides = { ...(p.overrides ?? {}) };
  if (Object.keys(cur).length) overrides[app] = cur; else delete overrides[app];
  return { ...p, overrides };
}
