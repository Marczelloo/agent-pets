import type { Session, StageLayout } from '../types';

// Wymiary w pikselach CSS przy u = 0,3 (wysokość paska 48). Uzasadnienie: plan fazy 2, task 6.
export const SLOT = 74;
export const LEFT_REACH = 24;
export const RIGHT_REACH = 42;
export const PAD = 2;
export const BADGE_W = 24;
export const LIMITS_W = 26;
export const MAX_PETS = 5;
/** Sufit rozmiaru w pasku (%): przy 100% zwierzak z efektami zajmuje całą wysokość paska 48 px. */
export const SIZE_TASKBAR_MAX = 100;

/** Wymiary sceny po zastosowaniu rozmiaru (`zoom`), odstępu i marginesu z karty „Pasek”. */
export interface Geo { zoom: number; slot: number; left: number; right: number; pad: number; badgeW: number; limitsW: number }

export function geometry(zoom: number, gap: number, padding: number): Geo {
  return { zoom, slot: SLOT * zoom + gap, left: LEFT_REACH * zoom, right: RIGHT_REACH * zoom, pad: padding,
    badgeW: BADGE_W * zoom, limitsW: LIMITS_W * zoom };
}

const BASE: Geo = geometry(1, 0, PAD);

/** Skala sceny: w pasku rozmiar (≤ 100 %) × wysokość paska / 48; okno pływające ma już wysokość 48 × rozmiar. */
export function zoomOf(l: StageLayout, size: number): number {
  const h = l.height_css / 48;
  return l.mode === 'floating' ? h : Math.min(size, SIZE_TASKBAR_MAX) / 100 * h;
}

export interface LayoutOut {
  width: number;
  pets: { id: string; x: number }[];
  hidden: number;
  hiddenIds: string[];
  badgeX: number | null;
  limitsX: number | null;
  geo?: Geo;
}

export interface LayoutIn {
  sessions: Session[];
  hasLimits: boolean;
  maxWidth: number;
  maxPets?: number;
  geo?: Geo;
  /** kolejność rysowania (domyślnie według startu) */
  order?: (s: Session[]) => Session[];
  /** kolejność ważności do zwijania w „+N”: najważniejsze na końcu (domyślnie według startu, najnowsze zostają) */
  priority?: (s: Session[]) => Session[];
  showBadge?: boolean;
  showLimits?: boolean;
}

const URGENT = new Set(['needs_you', 'error']);

export function contentWidth(n: number, badge: boolean, limits: boolean, g: Geo = BASE): number {
  let w = 0;
  if (badge) w += g.badgeW;
  if (n > 0) w += g.left + (n - 1) * g.slot + g.right;
  if (limits) w += g.limitsW;
  return w === 0 ? 0 : w + 2 * g.pad;
}

export function capacity(total: number, hasLimits: boolean, maxWidth: number, maxPets = MAX_PETS, g: Geo = BASE, badge = true): number {
  for (let n = Math.min(total, maxPets); n > 0; n--) {
    if (contentWidth(n, badge && n < total, hasLimits, g) <= maxWidth) return n;
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
const startOrder = (v: Session[]) => [...v].sort(byStart);

export function layout(inp: LayoutIn): LayoutOut {
  const g = inp.geo ?? BASE;
  const showBadge = inp.showBadge ?? true;
  const hasLimits = inp.hasLimits && (inp.showLimits ?? true);
  const ranked = (inp.priority ?? startOrder)(inp.sessions);
  const cap = capacity(ranked.length, hasLimits, inp.maxWidth, inp.maxPets, g, showBadge);
  const { visible: kept, hidden } = pickVisible(ranked, cap);
  const visible = (inp.order ?? startOrder)(kept);
  const badge = showBadge && hidden > 0;
  const width = contentWidth(visible.length, badge, hasLimits, g);
  const all = startOrder(inp.sessions);
  if (width > inp.maxWidth) {
    return { width: 0, pets: [], hidden: all.length, hiddenIds: all.map(s => s.id), badgeX: null, limitsX: null, geo: g };
  }
  const shown = new Set(visible.map(s => s.id));
  let x = g.pad;
  const badgeX = badge ? x : null;
  if (badge) x += g.badgeW;
  return {
    width,
    pets: visible.map((s, i) => ({ id: s.id, x: x + g.left + i * g.slot })),
    hidden,
    hiddenIds: all.filter(s => !shown.has(s.id)).map(s => s.id),
    badgeX,
    limitsX: hasLimits ? width - g.pad - g.limitsW : null,
    geo: g,
  };
}
