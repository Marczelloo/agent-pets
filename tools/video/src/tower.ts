// The crew's pyramid and the rain of pets that builds it, as pure functions of time (no simulation state).
// Pets fall from above, land with a squash, and every landing squeezes the pets below and sets the stack swaying.
//
//            Kodek (net)                    row 2
//          Cursor    Grok   Android         row 1      (the blob sits on Clawd's head)
//      Clawd  opencode  Copilot  ZCode       row 0
import { SKINS, type SkinId } from '@app/skins';
import type { Who } from './actors';
import { at } from './beat';
import { clamp, easeOut, ring } from './util';

const SKIN: Record<Who, SkinId> = {
  clawd: 'clawd', kodek: 'kodek', opencode: 'opencode', copilot: 'copilot', android: 'antigravity', cursor: 'cursor', grok: 'grok', zcode: 'zcode', kilo: 'blob',
};

/** Height in pu from a pet's feet to the top of its body. */
export const heightOf = (w: Who): number => { const k = SKINS[SKIN[w]]; return (k.legs.length ? (k.legLen ?? 17) - 5 : 0) + k.height; };

export const GRAV = 5600;
/** Where pets start falling from (world y) and how long that takes. */
export const DROP_FROM = -760;
export const FALL_TIME = Math.sqrt((2 * -DROP_FROM) / GRAV);

export interface Slot { who: Who; x: number; row: number; land: number; on?: Who }

/** Everyone who is part of the pyramid. Clawd lands first, in close-up, on the downbeat of bar 3; the rest drop in one per beat after him. */
export const SLOTS: Slot[] = [
  { who: 'clawd', x: 0, row: 0, land: at(3, 0) },
  { who: 'opencode', x: 98, row: 0, land: at(3, 1) },
  { who: 'copilot', x: 196, row: 0, land: at(3, 2) },
  { who: 'cursor', x: 49, row: 1, land: at(3, 3) },
  { who: 'grok', x: 147, row: 1, land: at(4, 0) },
  { who: 'kodek', x: 98, row: 2, land: at(4, 1) },
  { who: 'kilo', x: -24, row: 1, land: at(4, 2), on: 'clawd' },
  { who: 'android', x: 245, row: 1, land: at(5, 0) },
];
export const slotOf = (w: Who): Slot | undefined => SLOTS.find(s => s.who === w);

/** The others come later: the sleeper on its pillow, and the floater. */
export const ZCODE = { land: at(4, 3), x: 276 };
export const ANDROID_LAND = at(5, 0);

export interface Pose { x: number; y: number; sx: number; sy: number; rot: number; hidden: boolean; airborne: boolean; age: number }

/** Squash and bounce of a pet that just landed (age = seconds since touchdown, negative = still in the air). */
export function landing(age: number): { sx: number; sy: number } {
  if (age < 0) return { sx: 0.93, sy: 1.13 };
  const q = ring(age, 0.34, 3.6, 7.5);
  return { sx: 1 + q * 0.75, sy: 1 - q };
}

/** Row heights (tallest pet in the row) and which rows stand on which. */
const ROW_H = [78, 82, 76];

/** How much row r is squeezed by the pets that have landed above it. */
export function rowLoad(T: number, r: number): number {
  let q = 0, above = 0;
  for (const s of SLOTS) {
    if (s.row <= r || s.on || s.land > T) continue;
    above++;
    q += ring(T - s.land, 0.1 / (1 + (s.row - r - 1) * 0.9), 3.6, 7.5);
  }
  return clamp(q + above * 0.02, -0.06, 0.16);
}

/** Feet height (world y) of row r, following the squeeze of everything below it. */
export function rowY(T: number, r: number): number {
  let y = 0;
  for (let k = 0; k < r; k++) y -= (ROW_H[k] - 3) * (1 - rowLoad(T, k));
  return y;
}

/** Kilo stands on Clawd's head: its own squeeze plus the row's. */
export function clawdTop(T: number): number { return -(heightOf('clawd') - 3) * (1 - rowLoad(T, 0)); }

/** Sway of the stack: a kick at every landing that rings out; the taller a pet stands, the more it moves. */
export function sway(T: number): number {
  let a = 0;
  SLOTS.forEach((s, k) => { if (s.land > 0) a += (k % 2 ? 1 : -1) * ring(T - s.land, 0.010 + 0.0055 * s.row, 1.35, 2.1); });
  return a;
}

/** The pyramid's height so far, eased so a camera following it does not jump on every landing. */
export function towerHeight(T: number): number {
  let h = 0;
  for (let r = 0; r < ROW_H.length; r++) {
    const first = Math.min(...SLOTS.filter(s => s.row === r && !s.on).map(s => (s.land < 0 ? -9 : s.land)));
    h += (ROW_H[r] - 3) * easeOut(clamp((T - (first - 0.05)) / 0.7));
  }
  return h;
}

/** Falling from above onto `targetY`: stretches on the way down, squashes and rings on landing. */
export function drop(T: number, land: number, x: number, targetY: number, spin = 0): Pose {
  const age = T - land;
  if (T < land - FALL_TIME) return { x, y: DROP_FROM, sx: 1, sy: 1, rot: 0, hidden: true, airborne: true, age: -9 };
  const l = landing(age);
  if (age < 0) return { x, y: targetY - 0.5 * GRAV * age * age, sx: l.sx, sy: l.sy, rot: spin * Math.sin(age * 9), hidden: false, airborne: true, age };
  return { x, y: targetY, sx: l.sx, sy: l.sy, rot: 0, hidden: false, airborne: false, age };
}

/** Pose of a pyramid member: falls to its place, then sways with the stack and is squeezed by what stands above it. */
export function slotPose(T: number, s: Slot): Pose {
  const sw = sway(T);
  if (s.who === 'clawd') {
    const q = rowLoad(T, 0), l = landing(T - s.land);
    return { x: s.x, y: 0, sx: (1 + q * 0.4) * l.sx, sy: (1 - q) * l.sy, rot: 0, hidden: false, airborne: false, age: T - s.land };
  }
  const baseY = s.on ? clawdTop(T) : rowY(T, s.row), lift = -baseY;
  const p = drop(T, s.land, s.x, baseY, 0.28);
  if (p.hidden || p.airborne) return p;
  // once it stands, it rides the sway: shear with height, a hint of tilt
  const q = s.on ? 0 : rowLoad(T, s.row);
  return { ...p, x: p.x + sw * lift * 1.1, sx: p.sx * (1 + q * 0.4), sy: p.sy * (1 - q), rot: sw * 0.9 };
}
