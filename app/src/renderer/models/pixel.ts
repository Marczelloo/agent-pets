// Model pikselowy (spec wyglądu v2, 6): zwierzak na siatce w całkowitych pikselach urządzenia, same prostokąty,
// ruch skokowy co 0,1 s, mała paleta, pikselowe rekwizyty i znaczki. Mózg (sceny, sprężyny) wspólny.
import type { Look } from '../../types';
import { COL } from '../palette';
import { cl } from '../math';
import { pen } from '../pen';
import type { Pet } from '../pet';
import { rig } from './rig';
import { PROP_ANCHOR, PROP_PAL, SPRITES } from './sprites';

/** Piksele urządzenia na komórkę siatki (komórka ≈ 5 jednostek u), co najmniej 1. */
export const gridPx = (u: number, dpr: number) => Math.max(1, Math.round(5 * u * dpr));

type Pal = { k: string; m: string; s: string; h: string; e: string; w: string; x: string };
export const PIXEL_PAL: Record<'clawd' | 'kodek', Pal> = {
  clawd: { k: '#2B1D16', m: '#D97757', s: '#B25D3D', h: '#F2AE92', e: '#1E1410', w: '#FFFFFF', x: '#F0997B' },
  kodek: { k: '#2B1D16', m: '#F1EFE8', s: '#CBC6B8', h: '#FFFFFF', e: '#5DCAA5', w: '#2C2C2A', x: '#C9C7C1' },
};
const GREY: Pal = { k: '#2B1D16', m: '#A8A49A', s: '#86837A', h: '#C9C6BD', e: '#1E1410', w: '#FFFFFF', x: '#A5A298' };
/** Bryła w komórkach: szerokość, wysokość. */
const BODY = { clawd: [20, 15], kodek: [18, 15] } as const;

type Op = [cx: number, cy: number, w: number, h: number, col: string];
interface Frame { key: string; ox: number; ops: Op[] }

export function drawPixel(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, _look: Look): void {
  const dpr = pen.dpr || 1, g = gridPx(u, dpr) / dpr, step = Math.floor(t * 10 + 1e-6);
  // ruch skokowy: nowa klatka raz na 0,1 s; w międzyczasie ta sama, choć sprężyny dalej się ruszają
  const key = `${step}|${g}|${u}|${c.type}`;
  let f: Frame | undefined = c.pxFrame;
  if (!f || f.key !== key) { f = build(c, X, Y, u, step / 10, g, key); c.pxFrame = f; }
  const snap = (v: number) => Math.round(v * dpr) / dpr, X0 = snap(X) + f.ox * g, Y0 = snap(Y);
  x.save();
  x.globalAlpha = (1 - .22 * cl(c.p.dim.x)) * (c.alpha ?? 1);
  for (const [cx, cy, w, h, col] of f.ops) { x.fillStyle = col; x.fillRect(X0 + cx * g, Y0 + cy * g, w * g, h * g); }
  x.restore();
}

/** Jedna klatka modelu jako lista komórek względem podstawy zwierzaka. */
function build(c: Pet, X: number, Y: number, u: number, ts: number, g: number, key: string): Frame {
  const skin = c.type, [bw, bh0] = BODY[skin];
  const r = rig(c, X, Y, u, ts, { w: bw * 5, h: bh0 * 5, arm: 16 });
  const pal = r.grey > .5 ? GREY : PIXEL_PAL[skin];
  const C = (v: number) => Math.round(v / g), ops: Op[] = [];
  const cell = (cx: number, cy: number, w: number, h: number, col: string) => { ops.push([cx, cy, w, h, col]); };
  const blit = (rows: string[], cx: number, cy: number) => rows.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      let n = 1;
      while (i + n < row.length && row[i + n] === ch) n++;
      if (ch !== '.') cell(cx + i, cy + j, n, 1, PROP_PAL[ch]);
      i += n;
    }
  });
  const tg = c.tg || {};

  // cień i poduszka
  cell(-bw / 2, 0, bw, 1, 'rgba(0,0,0,0.16)');
  if (c.prop === 'pillow' && cl(c.p.propA.x) > .5) { const a = PROP_ANCHOR.pillow; blit(SPRITES.pillow, C(a[0] * u), -SPRITES.pillow.length); }

  // bryła
  const bh = bh0 + Math.round((r.sy - 1) * bh0);
  const lift = C(r.oy), legs = r.down > .5 ? 0 : 3;
  const by = -legs - bh + lift - Math.round(r.down * 2), bx = -bw / 2;
  if (legs) {
    const lx = skin === 'clawd' ? [-7, -3, 1, 5] : [-6, 3];
    const walkUp = (i: number) => (r.walk > .3 && (Math.floor(ts * 10) + i) % 2 ? 1 : 0);
    lx.forEach((l, i) => cell(l, -legs - walkUp(i) + lift, skin === 'clawd' ? 2 : 3, legs, pal.s));
  }
  if (skin === 'clawd') { cell(bx - 2, by + 6, 2, 4, pal.k); cell(bx + bw, by + 6, 2, 4, pal.k); cell(bx - 1, by + 7, 1, 2, pal.m); cell(bx + bw, by + 7, 1, 2, pal.m); }
  cell(bx + 1, by, bw - 2, bh, pal.k);
  cell(bx, by + 1, bw, bh - 2, pal.k);
  cell(bx + 1, by + 1, bw - 2, bh - 2, pal.m);
  cell(bx + 1, by + bh - 3, bw - 2, 2, pal.s);
  cell(bx + 2, by + 2, bw - 5, 1, pal.h);

  // twarz
  const fx = r.face + C(r.gaze[0] * u), fy = by + (skin === 'clawd' ? 6 : 6) + C(r.gaze[1] * u), e = r.eyes;
  if (skin === 'kodek') {
    cell(bx + 2, by + 3, bw - 4, bh - 6, pal.w);
    cell(bx - 1, by + 5, 2, 5, pal.x); cell(bx + bw - 1, by + 5, 2, 5, pal.x);
    const ax = Math.round(Math.sin(c.aa || 0) * 2);
    cell(ax, by - 3, 1, 3, pal.k); cell(ax - 1, by - 5, 2, 2, pal.e);
  }
  const eye = (ex: number) => {
    if (e.happy > .5) { cell(ex - 1, fy + 1, 1, 1, pal.e); cell(ex, fy, 1, 1, pal.e); cell(ex + 1, fy + 1, 1, 1, pal.e); return; }
    if (e.dizzy > .5) { cell(ex - 1, fy, 1, 1, pal.e); cell(ex + 1, fy, 1, 1, pal.e); cell(ex, fy + 1, 1, 1, pal.e); cell(ex - 1, fy + 2, 1, 1, pal.e); cell(ex + 1, fy + 2, 1, 1, pal.e); return; }
    if (e.open < .4) { cell(ex - 1, fy + 2, 3, 1, pal.e); return; }
    cell(ex, fy, 2, 3, pal.e);
    if (skin === 'clawd') cell(ex + 1, fy, 1, 1, pal.w);
  };
  const eo = skin === 'clawd' ? 4 : 4;
  eye(fx - eo - 1); eye(fx + eo);
  if (skin === 'clawd') {
    if (e.open > .3 && e.happy < .5) { cell(fx - 1, fy + 5, 1, 1, pal.e); cell(fx, fy + 6, 2, 1, pal.e); cell(fx + 2, fy + 5, 1, 1, pal.e); }
    cell(fx - eo - 4, fy + 4, 2, 1, pal.x); cell(fx + eo + 3, fy + 4, 2, 1, pal.x);
  }

  // rekwizyt, łapki, przedmiot w dłoni
  const prop = c.prop && c.prop !== 'pillow' && cl(c.p.propA.x) > .5 ? c.prop : null;
  if (prop && SPRITES[prop]) { const a = PROP_ANCHOR[prop] ?? [60, 0]; blit(SPRITES[prop], C(a[0] * u), C(a[1] * u) - SPRITES[prop].length); }
  r.arms.forEach(a => {
    const sx = C(a.sw[0]), sy = C(a.sw[1]), hx = C(a.hx), hy = C(a.hy);
    line(sx, sy, hx, hy, (px, py) => cell(px - 1, py - 1, 2, 2, pal.m));
    cell(hx - 1, hy - 1, 3, 3, pal.k); cell(hx, hy, 1, 1, pal.m);
  });
  const hold = c.hold && cl(c.p.holdA.x) > .5 ? c.hold : null;
  if (hold && SPRITES[hold]) { const R = r.arms[1], s = SPRITES[hold]; blit(s, C(R.hx) - (hold === 'net' ? 3 : 1), C(R.hy) - s.length + 1); }
  if (tg._mug) { const R = r.arms[1]; blit(SPRITES.mug, C(R.hx) - 1, C(R.hy) - 2); }

  // nakładki: „!”, myślenie, zawroty, cząsteczki
  if (c.p.bubble.x > .5) blit(SPRITES.bang, bx - 3, by - 10);
  if (cl(c.p.think.x) > .3) for (let i = 0; i < 3; i++) { const a = ts * 4 + i * 2.1; cell(Math.round(Math.cos(a) * 6), by - 4 + Math.round(Math.sin(a) * 1.5), 1, 1, COL.clay); }
  if (e.dizzy > .3) for (let i = 0; i < 3; i++) { const a = ts * 6 + i * 2.1; blit(SPRITES.spark, Math.round(Math.cos(a) * 7) - 1, by - 3 + Math.round(Math.sin(a))); }
  for (const q of c.parts) {
    const px = C(q.x * u), py = C(q.y * u);
    if (q.t === 'z') blit(SPRITES.z, px, py);
    else if (q.k === 'imp') blit(SPRITES.spark, px - 1, py - 1);
    else if (q.k === 'plane' || q.k === 'page') cell(px, py, 2, 2, PROP_PAL.p);
    else if (q.k === 'drop') cell(px, py, 1, 2, PROP_PAL.b);
    else cell(px, py, 1, 1, COL[q.col] || COL.clay);
  }
  return { key, ox: Math.round((r.XX - X) / g), ops };
}

/** Linia Bresenhama po komórkach siatki. */
function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (;;) {
    plot(x0, y0);
    if ((x0 === x1 && y0 === y1) || n++ > 200) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
