// Pet appearance (drawing style and motion): a shared default and per-agent overrides. Mirrors core `Pets`.
import type { AppId, Look, MotionId, Pets, Session, StageSettings, StyleId } from './types';

export const STYLE_IDS: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel'];
export const MOTION_IDS: MotionId[] = ['calm', 'dynamic'];
/** Appearance without settings: exactly the v6 prototype drawing (parity tests). */
export const DEFAULT_LOOK: Look = { style: 'clean', motion: 'calm' };

/** Like core `Pets::default()`. */
export const defaultPets = (): Pets => ({ style: 'sticker', motion: 'calm', overrides: {}, max_visible: 5, react_to_media: true });

/** Like core `Stage::default()`: a tray-adjacent stage without a background, as in 0.6. */
export const defaultStage = (): StageSettings => ({
  position: 'right', monitor: 'primary', background: { kind: 'none', radius: 12 },
  size: 100, gap: 0, padding: 2, align: 'right', order: 'start', show: { progress: true, limits: true, badge: true },
  bubbles: { questions: true, actions: true }, minis: true,
});

/** App whose appearance override applies to the session; `null` = agent without custom settings (default appearance). */
export function appFor(s: Pick<Session, 'agent' | 'origin'>): AppId | null {
  if (s.origin === 'router') return 'agent_router';
  switch (s.agent) {
    case 'claude': return 'claude_code';
    case 'codex': return 'codex';
    case 'opencode': return 'opencode';
    case 'copilot': return 'copilot';
    case 'antigravity': return 'antigravity';
    case 'cursor': return 'cursor';
    case 'grok': return 'grok';
    case 'zcode': return 'zcode';
    default: return null;
  }
}

/** The old `anime` motion is now `dynamic` (core also reads the old identifier). */
const motionOf = (m: MotionId | 'anime'): MotionId => (m === 'anime' ? 'dynamic' : m);

export function lookFor(p: Pets, app: AppId | null): Look {
  const o = (app && p.overrides?.[app]) || {};
  return { style: o.style ?? p.style, motion: motionOf(o.motion ?? p.motion) };
}

/** `null` = "Use default": removes the field, and an empty override disappears. */
export function withOverride(p: Pets, app: AppId, field: keyof Look, v: StyleId | MotionId | null): Pets {
  const cur: Partial<Look> = { ...(p.overrides?.[app] ?? {}) };
  if (v == null) delete cur[field]; else (cur as Record<string, string>)[field] = v;
  const overrides = { ...(p.overrides ?? {}) };
  if (Object.keys(cur).length) overrides[app] = cur; else delete overrides[app];
  return { ...p, overrides };
}
