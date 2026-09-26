import type { Session, StageLayout } from '../types';
import { MINI_SCALE } from './minis';

// Wymiary w pikselach CSS przy u = 0,3 (wysokość paska 48). Uzasadnienie: plan fazy 2, task 6.
export const SLOT = 74;
export const LEFT_REACH = 24;
export const RIGHT_REACH = 42;
export const PAD = 2;
export const BADGE_W = 24;
export const LIMITS_W = 26;
export const MAX_PETS = 5;
/** Plakietka „+N” dzieci przy mini-zwierzakach (px CSS przy zoom 1). */
export const MINI_MORE_W = 16;
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

/** Zwierzak rodzica albo zwykłej sesji z jego mini-zwierzakami (środki w px CSS sceny). */
export interface PetAt { id: string; x: number; minis: { id: string; x: number }[]; miniMore: { x: number; n: number } | null }

export interface LayoutOut {
  width: number;
  pets: PetAt[];
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
  /** mini-zwierzaki rodzica (dzieci widoczne jako mini i liczba pozostałych) */
  minis?: (parent: Session) => { shown: Session[]; more: number };
  /** mini stoją po lewej rodzica (scena rośnie w lewo, kotwica z prawej) */
  minisLeft?: boolean;
}

const URGENT = new Set(['needs_you', 'error']);

/** `extra`: łączna szerokość mini-zwierzaków i ich plakietek. */
export function contentWidth(n: number, badge: boolean, limits: boolean, g: Geo = BASE, extra = 0): number {
  let w = 0;
  if (badge) w += g.badgeW;
  if (n > 0) w += g.left + (n - 1) * g.slot + g.right + extra;
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
  // dzieci (subagenci) stoją przy rodzicu jako mini; „najwięcej widocznych” i „+N” liczą tylko rodziców
  const own = inp.sessions.filter(s => !s.parent);
  const ranked = (inp.priority ?? startOrder)(own);
  const miniSlot = SLOT * g.zoom * MINI_SCALE, moreW = MINI_MORE_W * g.zoom;
  const groups = new Map<string, { shown: Session[]; more: number }>();
  const minisOf = (s: Session) => {
    let m = groups.get(s.id);
    if (!m) { m = inp.minis?.(s) ?? { shown: [], more: 0 }; groups.set(s.id, m); }
    return m;
  };
  const extraOf = (s: Session) => { const m = minisOf(s); return m.shown.length * miniSlot + (m.more > 0 ? moreW : 0); };
  // szerokość grupy (rodzic i jego mini) liczy się do miejsca w pasku
  const plain = capacity(ranked.length, hasLimits, inp.maxWidth, inp.maxPets, g, showBadge);
  let cap = plain;
  for (; cap > 0; cap--) {
    const v = pickVisible(ranked, cap).visible;
    if (contentWidth(cap, showBadge && cap < ranked.length, hasLimits, g, v.reduce((w, s) => w + extraOf(s), 0)) <= inp.maxWidth) break;
  }
  // żadna grupa z mini się nie mieści: rodzice bez mini zamiast pustej sceny
  if (cap === 0 && plain > 0) { cap = plain; for (const s of ranked) groups.set(s.id, { shown: [], more: 0 }); }
  const { visible: kept, hidden } = pickVisible(ranked, cap);
  const visible = (inp.order ?? startOrder)(kept);
  const badge = showBadge && hidden > 0;
  const width = contentWidth(visible.length, badge, hasLimits, g, visible.reduce((w, s) => w + extraOf(s), 0));
  const all = startOrder(own);
  if (width > inp.maxWidth) {
    return { width: 0, pets: [], hidden: all.length, hiddenIds: all.map(s => s.id), badgeX: null, limitsX: null, geo: g };
  }
  const shown = new Set(visible.map(s => s.id));
  let x = g.pad;
  const badgeX = badge ? x : null;
  if (badge) x += g.badgeW;
  const ml = LEFT_REACH * g.zoom * MINI_SCALE;
  const pets: PetAt[] = visible.map(s => {
    const m = minisOf(s), extra = extraOf(s);
    // grupa: [plakietka][mini…][rodzic] przy kotwicy z prawej, [rodzic][mini…][plakietka] przy lewej
    const px = inp.minisLeft ? x + extra + g.left : x + g.left;
    const from = inp.minisLeft ? x + extra - miniSlot : px + g.right;
    const step = inp.minisLeft ? -miniSlot : miniSlot;
    const minis = m.shown.map((c, k) => ({ id: c.id, x: from + k * step + ml }));
    const moreAt = inp.minisLeft ? x + moreW / 2 : from + m.shown.length * miniSlot + moreW / 2;
    x += g.slot + extra;
    return { id: s.id, x: px, minis, miniMore: m.more > 0 ? { x: moreAt, n: m.more } : null };
  });
  return {
    width,
    pets,
    hidden,
    hiddenIds: all.filter(s => !shown.has(s.id)).map(s => s.id),
    badgeX,
    limitsX: hasLimits ? width - g.pad - g.limitsW : null,
    geo: g,
  };
}
