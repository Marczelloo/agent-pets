import type { Session } from '../types';

// Wymiary w pikselach CSS przy u = 0,3 (wysokość paska 48). Uzasadnienie: plan fazy 2, task 6.
export const SLOT = 74;
export const LEFT_REACH = 24;
export const RIGHT_REACH = 42;
export const PAD = 2;
export const BADGE_W = 24;
export const LIMITS_W = 26;
export const MAX_PETS = 5;

export interface LayoutOut {
  width: number;
  pets: { id: string; x: number }[];
  hidden: number;
  hiddenIds: string[];
  badgeX: number | null;
  limitsX: number | null;
}

const URGENT = new Set(['needs_you', 'error']);

export function contentWidth(n: number, badge: boolean, limits: boolean): number {
  let w = 0;
  if (badge) w += BADGE_W;
  if (n > 0) w += LEFT_REACH + (n - 1) * SLOT + RIGHT_REACH;
  if (limits) w += LIMITS_W;
  return w === 0 ? 0 : w + 2 * PAD;
}

export function capacity(total: number, hasLimits: boolean, maxWidth: number, maxPets = MAX_PETS): number {
  for (let n = Math.min(total, maxPets); n > 0; n--) {
    if (contentWidth(n, n < total, hasLimits) <= maxWidth) return n;
  }
  return 0;
}

export function pickVisible(sorted: Session[], cap: number): { visible: Session[]; hidden: number } {
  if (sorted.length <= cap) return { visible: sorted, hidden: 0 };
  if (cap <= 0) return { visible: [], hidden: sorted.length };
  const keep = new Set(sorted.filter(s => URGENT.has(s.state)).slice(-cap).map(s => s.id));
  const rest = sorted.filter(s => !keep.has(s.id));
  for (let i = rest.length - 1; i >= 0 && keep.size < cap; i--) keep.add(rest[i].id);
  const visible = sorted.filter(s => keep.has(s.id));
  return { visible, hidden: sorted.length - visible.length };
}

const byStart = (a: Session, b: Session) => a.started_at - b.started_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function layout(inp: { sessions: Session[]; hasLimits: boolean; maxWidth: number; maxPets?: number }): LayoutOut {
  const sorted = [...inp.sessions].sort(byStart);
  const cap = capacity(sorted.length, inp.hasLimits, inp.maxWidth, inp.maxPets);
  const { visible, hidden } = pickVisible(sorted, cap);
  const badge = hidden > 0;
  const width = contentWidth(visible.length, badge, inp.hasLimits);
  if (width > inp.maxWidth) {
    return { width: 0, pets: [], hidden: sorted.length, hiddenIds: sorted.map(s => s.id), badgeX: null, limitsX: null };
  }
  const shown = new Set(visible.map(s => s.id));
  let x = PAD;
  const badgeX = badge ? x : null;
  if (badge) x += BADGE_W;
  return {
    width,
    pets: visible.map((s, i) => ({ id: s.id, x: x + LEFT_REACH + i * SLOT })),
    hidden,
    hiddenIds: sorted.filter(s => !shown.has(s.id)).map(s => s.id),
    badgeX,
    limitsX: inp.hasLimits ? width - PAD - LIMITS_W : null,
  };
}
