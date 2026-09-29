// Pixel model (appearance spec v2, 6): pet on a grid of whole device pixels, rectangles only,
// stepped motion every 0.1 s, small palette, pixel props and badges. Brain (scenes, springs) is shared.
//
// Dimensions are calculated in brain units (u), as in the vector model, then converted to cells.
// A cell has a fixed number of device pixels (2 in the taskbar), so at 150% display scale there are more cells,
// but the pet has the same size; props, hands, and overlays align with other styles.
import type { Look } from '../../types';
import { COL } from '../palette';
import { cl } from '../math';
import { pen } from '../pen';
import type { Pet } from '../pet';
import { rig } from './rig';
import { PROP_ANCHOR, PROP_PAL, SPRITES } from './sprites';

/** Device pixels per grid cell: 2 in the taskbar (u = 0.3), more in a large preview. */
export const gridPx = (u: number, _dpr: number) => Math.max(1, Math.round(6 * u));

type Pal = { k: string; m: string; s: string; h: string; e: string; w: string; x: string };
export const PIXEL_PAL: Record<'clawd' | 'kodek', Pal> = {
  clawd: { k: '#2B1D16', m: '#D97757', s: '#B25D3D', h: '#F2AE92', e: '#1E1410', w: '#FFFFFF', x: '#F0997B' },
  kodek: { k: '#2B1D16', m: '#F1EFE8', s: '#CBC6B8', h: '#FFFFFF', e: '#5DCAA5', w: '#2C2C2A', x: '#C9C7C1' },
};
const GREY: Pal = { k: '#2B1D16', m: '#A8A49A', s: '#86837A', h: '#C9C6BD', e: '#1E1410', w: '#FFFFFF', x: '#A5A298' };
/** Body in u units (like vector-model skins). */
const BODY = { clawd: { w: 98, h: 58 }, kodek: { w: 88, h: 64 } } as const;
/** Prop sprite pixel size in u units. */
const SPRITE_U = 5;

type Op = [cx: number, cy: number, w: number, h: number, col: string];
interface Frame { key: string; ox: number; ops: Op[] }

export function drawPixel(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, _look: Look): void {
  const dpr = pen.dpr || 1, g = gridPx(u, dpr) / dpr, step = Math.floor(t * 10 + 1e-6);
  // stepped motion: a new frame every 0.1 s; same frame between them while springs keep moving
  const key = `${step}|${g}|${u}|${c.type}`;
  let f: Frame | undefined = c.pxFrame;
  if (!f || f.key !== key) { f = build(c, X, Y, u, step / 10, g, key); c.pxFrame = f; }
  const snap = (v: number) => Math.round(v * dpr) / dpr, X0 = snap(X) + f.ox * g, Y0 = snap(Y);
  x.save();
  x.globalAlpha = (1 - .22 * cl(c.p.dim.x)) * (c.alpha ?? 1);
  for (const [cx, cy, w, h, col] of f.ops) { x.fillStyle = col; x.fillRect(X0 + cx * g, Y0 + cy * g, w * g, h * g); }
  x.restore();
}

/** One model frame as a list of cells relative to the pet's base. */
function build(c: Pet, X: number, Y: number, u: number, ts: number, g: number, key: string): Frame {
  // only Clawd and Codex: other skins render in Pixel as Clean (`effectiveStyle`)
  const skin = c.type as 'clawd' | 'kodek', B = BODY[skin];
  const r = rig(c, X, Y, u, ts, { w: B.w, h: B.h, arm: 16 });
  const pal = r.grey > .5 ? GREY : PIXEL_PAL[skin];
  const C = (css: number) => Math.round(css / g), U = (units: number) => Math.round(units * u / g);
  const n = (units: number, min = 1) => Math.max(min, U(units));
  const ops: Op[] = [];
  const cell = (cx: number, cy: number, w: number, h: number, col: string) => { if (w > 0 && h > 0) ops.push([cx, cy, w, h, col]); };
  /** Sprite scaled by nearest neighbor to a size in u (one sprite pixel = SPRITE_U units). */
  const blit = (rows: string[], cx: number, cy: number, pu = SPRITE_U) => {
    const sw = rows[0].length, sh = rows.length, tw = n(sw * pu), th = n(sh * pu);
    for (let j = 0; j < th; j++) {
      const row = rows[Math.min(sh - 1, Math.floor(j * sh / th))];
      let i = 0;
      while (i < tw) {
        const ch = row[Math.min(sw - 1, Math.floor(i * sw / tw))];
        let k = 1;
        while (i + k < tw && row[Math.min(sw - 1, Math.floor((i + k) * sw / tw))] === ch) k++;
        if (ch !== '.') cell(cx + i, cy + j, k, 1, PROP_PAL[ch]);
        i += k;
      }
    }
    return th;
  };
  const tg = c.tg || {};

  // shadow and pillow
  const bw = 2 * Math.round(U(B.w) / 2), half = bw / 2;
  cell(-half, 0, bw, 1, 'rgba(0,0,0,0.16)');
  if (c.prop === 'pillow' && cl(c.p.propA.x) > .5) { const a = PROP_ANCHOR.pillow; blit(SPRITES.pillow, U(a[0]), -n(SPRITES.pillow.length * SPRITE_U)); }

  // body: base and top as in vector model (bot = −12u on legs, 0 when seated)
  const bh = Math.max(4, Math.round(U(B.h) * r.sy)), lift = C(r.oy);
  const bottom = C(r.bot) + lift, by = bottom - bh, bx = -half;
  const legs = -C(r.bot);
  if (legs > 0) {
    const lx = skin === 'clawd' ? [-.33, -.12, .12, .33] : [-.25, .25], lw = n(skin === 'clawd' ? 10 : 16, 2);
    const walkUp = (i: number) => (r.walk > .3 && (Math.floor(ts * 10) + i) % 2 ? 1 : 0);
    lx.forEach((l, i) => cell(Math.round(l * bw) - (lw >> 1), bottom, lw, legs - walkUp(i), pal.s));
  }
  if (skin === 'clawd') {
    const ew = n(4, 1), eh = n(16, 2), ey = by + Math.round(bh * .4);
    cell(bx - ew - 1, ey, ew + 1, eh, pal.k); cell(bx + bw, ey, ew + 1, eh, pal.k);
    cell(bx - ew, ey + 1, ew, eh - 2, pal.m); cell(bx + bw, ey + 1, ew, eh - 2, pal.m);
  }
  cell(bx + 1, by, bw - 2, bh, pal.k);
  cell(bx, by + 1, bw, bh - 2, pal.k);
  cell(bx + 1, by + 1, bw - 2, bh - 2, pal.m);
  cell(bx + 1, by + bh - 1 - n(6), bw - 2, n(6), pal.s);
  cell(bx + 2, by + 2, Math.max(1, bw - 5), 1, pal.h);

  // twarz
  const fx = r.face + U(r.gaze[0]), e = r.eyes;
  if (skin === 'kodek') {
    const m = n(9, 2);
    cell(bx + m, by + m, bw - 2 * m, bh - 2 * m - 1, pal.w);
    const pw = n(6, 2), ph = Math.round(bh * .35);
    cell(bx - pw + 1, by + Math.round(bh * .32), pw, ph, pal.x); cell(bx + bw - 1, by + Math.round(bh * .32), pw, ph, pal.x);
    const ax = Math.round(Math.sin(c.aa || 0) * n(4)), al = n(12, 2), ab = n(6, 2);
    cell(ax, by - al, 1, al, pal.k); cell(ax - (ab >> 1), by - al - ab, ab, ab, pal.e);
  }
  const eW = n(6, 1), eH = n(12, 2), fy = by + Math.round(bh * (skin === 'clawd' ? .3 : .34)) + U(r.gaze[1]);
  const eye = (ex: number) => {
    if (e.happy > .5) { cell(ex - 1, fy + 1, 1, 1, pal.e); cell(ex, fy, eW, 1, pal.e); cell(ex + eW, fy + 1, 1, 1, pal.e); return; }
    if (e.dizzy > .5) { cell(ex, fy, 1, 1, pal.e); cell(ex + eW, fy, 1, 1, pal.e); cell(ex, fy + 2, 1, 1, pal.e); cell(ex + eW, fy + 2, 1, 1, pal.e); return; }
    if (e.open < .4) { cell(ex - 1, fy + (eH >> 1), eW + 2, 1, pal.e); return; }
    cell(ex, fy, eW, eH, pal.e);
    if (skin === 'clawd') cell(ex + eW - 1, fy, 1, 1, pal.w);
  };
  const eo = Math.round(bw * .2);
  eye(fx - eo - eW + 1); eye(fx + eo);
  // face anchor for Dynamic effects: cells → u units
  c.face = [(fx + .5) * g / u, (fy + eH / 2) * g / u, (eo + eW / 2) * g / u];
  if (skin === 'clawd') {
    const my = fy + eH + 1;
    if (e.open > .3 && e.happy < .5) { cell(fx - 1, my, 1, 1, pal.e); cell(fx, my + 1, 2, 1, pal.e); cell(fx + 2, my, 1, 1, pal.e); }
    const bl = n(6, 2);
    cell(fx - eo - eW - bl + 1, my - 1, bl, 1, pal.x); cell(fx + eo + eW, my - 1, bl, 1, pal.x);
  }

  // prop, paws, object in hand
  const prop = c.prop && c.prop !== 'pillow' && cl(c.p.propA.x) > .5 ? c.prop : null;
  if (prop && SPRITES[prop]) { const a = PROP_ANCHOR[prop] ?? [60, 0]; blit(SPRITES[prop], U(a[0]), U(a[1]) - n(SPRITES[prop].length * SPRITE_U)); }
  const brush = n(7, 1), hand = n(10, 2);
  r.arms.forEach(a => {
    const sx = C(a.sw[0]), sy = C(a.sw[1]), hx = C(a.hx), hy = C(a.hy);
    line(sx, sy, hx, hy, (px, py) => cell(px - (brush >> 1), py - (brush >> 1), brush, brush, pal.m));
    cell(hx - (hand >> 1), hy - (hand >> 1), hand, hand, pal.k);
    cell(hx - (hand >> 1) + 1, hy - (hand >> 1) + 1, hand - 2, hand - 2, pal.m);
  });
  const hold = c.hold && cl(c.p.holdA.x) > .5 ? c.hold : null;
  if (hold && SPRITES[hold]) {
    const R = r.arms[1], s = SPRITES[hold], w = n(s[0].length * SPRITE_U), h = n(s.length * SPRITE_U);
    blit(s, C(R.hx) - (hold === 'net' ? w >> 1 : 1), C(R.hy) - h + 1);
  }
  if (tg._mug) { const R = r.arms[1]; blit(SPRITES.mug, C(R.hx) - 1, C(R.hy) - n(SPRITES.mug.length * SPRITE_U)); }

  // worn item (stats badges): above or on the body, on the grid
  if (c.wear === 'crown' || c.wear === 'nightcap') {
    const s = SPRITES[c.wear], w = n(s[0].length * SPRITE_U), h = n(s.length * SPRITE_U);
    blit(s, c.wear === 'crown' ? -(w >> 1) : -(w >> 1) + n(4), by - h + (c.wear === 'crown' ? 1 : n(4)));
  } else if (c.wear === 'headband') {
    cell(bx, by + n(5), bw, n(5, 2), PROP_PAL.c);
    cell(bx + bw, by + n(3), n(5), n(5, 2), PROP_PAL.c);
  } else if (c.wear === 'bib') {
    const w = 2 * Math.round(bw * .3), y = by + Math.round(bh * .56);
    cell(-(w >> 1), y, w, n(12, 2), PROP_PAL.p);
    cell(-(w >> 1) + 1, y + n(4), w - 2, 1, PROP_PAL.c);
  } else if (c.wear === 'scarf') {
    const y = by + Math.round(bh * .62);
    cell(bx, y, bw, n(6, 2), PROP_PAL.b);
    cell(Math.round(bw * .15), y + n(4), n(6, 2), n(12, 2), PROP_PAL.b);
    cell(bx + 2, y + 1, 1, 1, PROP_PAL.w);
  }

  // overlays (positions as in vector model: bubble at top−20u, thought at top−22u)
  if (c.p.bubble.x > .5) { const bh2 = n(SPRITES.bang.length * 4); blit(SPRITES.bang, U(-B.w * .31) - n(10), by + 1 - bh2, 4); } // anchored to the head: fits in the taskbar during jumps
  if (cl(c.p.think.x) > .3) for (let i = 0; i < 3; i++) { const a = ts * 4 + i * 2.1; cell(U(Math.cos(a) * 30), by - n(18) + Math.round(Math.sin(a) * 1.5), 1, 1, COL.clay); }
  if (cl(c.phA || 0) > .5) { // headphones (`vibe` scene)
    const cw = n(9, 2), ch = n(18, 3), cy = by + Math.round(bh * .1), lx = bx - (cw >> 1), rx = bx + bw + (cw >> 1) - 1, ac = skin === 'kodek' ? COL.teal : COL.clay;
    cell(lx, by - 2, rx - lx + 1, 1, pal.k); cell(lx, by - 2, 1, cy - by + 2, pal.k); cell(rx, by - 2, 1, cy - by + 2, pal.k);
    [bx - cw, bx + bw].forEach(cx => { cell(cx, cy, cw, ch, pal.k); if (cw > 2 && ch > 2) cell(cx + 1, cy + 1, cw - 2, ch - 2, ac); });
  }
  if (e.dizzy > .3) for (let i = 0; i < 3; i++) { const a = ts * 6 + i * 2.1; blit(SPRITES.spark, U(Math.cos(a) * 34) - 1, by - n(8) + Math.round(Math.sin(a))); }
  for (const q of c.parts) {
    const px = U(q.x), py = U(q.y);
    if (q.t === 'z') blit(SPRITES.z, px, py);
    else if (q.k === 'imp') blit(SPRITES.spark, px - 1, py - 1);
    else if (q.k === 'plane' || q.k === 'page') cell(px, py, 2, 2, PROP_PAL.p);
    else if (q.k === 'drop') cell(px, py, 1, 2, PROP_PAL.b);
    else if (q.k === 'phones') { const w = n(50, 5), h = n(16, 3), cw = n(9, 2); cell(px - (w >> 1), py, w, 1, pal.k); cell(px - (w >> 1) - cw + 1, py + 1, cw, h, pal.k); cell(px + (w >> 1), py + 1, cw, h, pal.k); }
    else cell(px, py, 1, 1, COL[q.col] || COL.clay);
  }
  return { key, ox: Math.round((r.XX - X) / g), ops };
}

/** Bresenham line across grid cells. */
function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, k = 0;
  for (;;) {
    plot(x0, y0);
    if ((x0 === x1 && y0 === y1) || k++ > 200) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
