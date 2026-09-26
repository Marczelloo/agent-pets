// Efekty Dynamiczny na siatce modelu pikselowego (spec 8.2 + 6): te same warstwy co wektorowe, ale każda figura to
// komórki siatki — linie Bresenhamem, koła i elipsy na komórkach, cząsteczki i słowa jako bitmapy.
import { PI, TAU, cl, hr } from '../../renderer/math';
import { gridPx } from '../../renderer/models/pixel';
import { pen } from '../../renderer/pen';
import { WORD_RISE, type FxState, type Particle } from '../../renderer/dynamic/state';
import type { Pet } from '../../renderer/pet';
import { GLYPHS, glyphWidth } from './glyphs';
import type { FxCtx } from './index';

const AMBER = '#EF9F27', WHITE = '#FFFFFF', RED = '#E24B4A', BLUE = '#5B8DEF', PURPLE = '#7F77DD', TEAL = '#5DCAA5', GREY = '#B4B2A9';

/** Siatka: komórka `g` px (całkowite piksele urządzenia), początek przyciągnięty do piksela urządzenia. */
/** `off` = przesunięcie początku w u: `lx` zwierzaka dla nakładek na ciele, 0 dla cząsteczek i słów (żyją w miejscu zwierzaka). */
function grid(x: CanvasRenderingContext2D, g: FxCtx, c: Pet, off = c.p.lx.x) {
  const G = gridPx(g.u, g.dpr) / g.dpr, snap = (v: number) => Math.round(v * g.dpr) / g.dpr;
  const X0 = snap(g.X + off * g.u), Y0 = snap(g.Y), U = (v: number) => Math.round(v * g.u / G);
  const cell = (cx: number, cy: number, w: number, h: number, col: string) => { if (w > 0 && h > 0) { x.fillStyle = col; x.fillRect(X0 + cx * G, Y0 + cy * G, w * G, h * G); } };
  const line = (x0: number, y0: number, x1: number, y1: number, col: string) => {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), e = dx + dy, n = 0; const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    for (;;) { cell(x0, y0, 1, 1, col); if ((x0 === x1 && y0 === y1) || n++ > 400) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  const ring = (cx: number, cy: number, rx: number, ry: number, col: string, fill = false) => {
    for (let j = -ry; j <= ry; j++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (j / (ry || 1)) ** 2)));
      if (fill) cell(cx - w, cy + j, 2 * w + 1, 1, col); else { cell(cx - w, cy + j, 1, 1, col); cell(cx + w, cy + j, 1, 1, col); } }
    if (!fill) for (let i = -rx; i <= rx; i++) { const h = Math.round(ry * Math.sqrt(Math.max(0, 1 - (i / (rx || 1)) ** 2))); cell(cx + i, cy - h, 1, 1, col); cell(cx + i, cy + h, 1, 1, col); }
  };
  /** Napis bitmapową czcionką: piksel glifu rośnie z u (jak czcionka wektorowa, ≈ 30u wysokości), co najmniej 9 px w pasku. */
  const text = (str: string, xu: number, yu: number, col: string) => {
    const P = Math.max(Math.ceil(9 / 7 * g.dpr), Math.round(30 / 7 * g.u * g.dpr)) / g.dpr, chars = [...str];
    const width = chars.reduce((a, ch) => a + glyphWidth(ch) + 1, -1), gy = Y0 + U(yu) * G - 3 * P;
    const pass = (c0: string, ox: number, oy: number) => {
      x.fillStyle = c0;
      let gx = X0 + U(xu) * G - Math.round(width / 2) * P;
      for (const ch of chars) { (GLYPHS[ch] ?? GLYPHS['!']).forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') x.fillRect(gx + (i + ox) * P, gy + (j + oy) * P, P, P); }); gx += (glyphWidth(ch) + 1) * P; }
    };
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pass(pen.ol, ox, oy);
    pass(col, 0, 0);
  };
  /** Mały obrazek z pikseli rozmiaru napisów (`P`), wyśrodkowany w (xu, yu); znaki wg palety `pal`. */
  const icon = (rows: string[], xu: number, yu: number, pal: Record<string, string>) => {
    const P = Math.max(Math.ceil(9 / 7 * g.dpr), Math.round(30 / 7 * g.u * g.dpr)) / g.dpr;
    const gx = X0 + U(xu) * G - Math.round(rows[0].length / 2) * P, gy = Y0 + U(yu) * G - Math.round(rows.length / 2) * P;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (pal[r[i]]) { x.fillStyle = pal[r[i]]; x.fillRect(gx + i * P, gy + j * P, P, P); } });
  };
  return { G, U, cell, line, ring, text, icon };
}

export function pixelBack(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const tg = c.tg || {}, bg = g.env.bg ? tg._bg : null, gr = tg._ground && cl(tg._groundK ?? 1) > 0.02 ? tg._ground : null;
  if (!bg && !gr && !g.flash) return;
  const { U, cell, line, ring } = grid(x, g, c), cy = U(-40), seed = Math.floor(g.t * 12);
  x.save(); x.globalAlpha = g.alpha;
  const rays = (n: number, r0: number, r1: number, col: string) => { for (let i = 0; i < n; i++) { const a = TAU * (i + hr(i + seed) * 0.6) / n;
    line(Math.round(Math.cos(a) * U(r0)), cy + Math.round(Math.sin(a) * U(r0) * 0.8), Math.round(Math.cos(a) * U(r1)), cy + Math.round(Math.sin(a) * U(r1) * 0.8), col); } };
  if (g.flash) { ring(0, cy, U(60), U(50), WHITE, true); rays(12, 36, 62, pen.ol); }
  else if (bg === 'speed' || bg === 'purple') { x.globalAlpha = g.alpha * 0.4; rays(14, 52, 72, bg === 'purple' ? PURPLE : pen.ol); }
  else if (bg === 'rays') { x.globalAlpha = g.alpha * 0.35; rays(10, 10, 75, AMBER); }
  else if (bg === 'wind') { x.globalAlpha = g.alpha * 0.45; for (let i = 0; i < 6; i++) { const off = Math.round(((g.t * 160 + i * 37) % 150) / 150 * U(150)); cell(U(-75) + off, cy + U(-40 + i * 14), U(22), 1, pen.ol); } }
  if (gr) { x.globalAlpha = g.alpha * cl(tg._groundK ?? 1); const col = gr === 'seal' ? RED : TEAL, gx = U(tg._groundX ?? 0);
    ring(gx, 0, U(34), Math.max(1, U(9)), col); ring(gx, 0, U(26), Math.max(1, U(7)), col); }
  x.restore();
}

/** Symbole myśli (w pikselach napisów): trybik, żarówka zgaszona i zapalona. */
const ICON = {
  gear: ['.g.g.', 'ggggg', '.gwg.', 'ggggg', '.g.g.'],
  bulb: ['.www.', 'wwwww', 'wwwww', '.www.', '.ggg.'],
  lit: ['.yyy.', 'yyyyy', 'yyyyy', '.yyy.', '.ggg.'],
};
const ICON_PAL: Record<string, string> = { g: GREY, w: '#F1EFE8', y: '#F5D547' };
const SPR: Partial<Record<Particle['k'], string[]>> = {
  spark: ['.a.', 'aaa', '.a.'], dust: ['gg', 'gg'], key: ['kkk', 'klk', 'kkk'], page: ['www', 'wkw', 'www', 'wkw'],
  energy: ['pp', 'pp'], note: ['.kk', '.k.', 'kk.'], tear: ['.b', 'bb', 'bb'], soul: ['.ww.', 'wkkw', 'wwww', 'w.ww'], helper: ['.cc.', 'cccc', 'c..c'],
};
const PAL: Record<string, string> = { a: AMBER, g: GREY, k: '#2B1D16', l: '#F1EFE8', w: WHITE, p: PURPLE, b: '#85B7EB', c: '#D97757' };

export function pixelFront(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const s: FxState | undefined = c.fx; if (!s) return;
  const tg = c.tg || {}, { U, cell, line, ring, text, icon } = grid(x, g, c), hands: number[][] = c.hand ?? [];
  const [fx0, fy0, gp] = (c.face as number[]) ?? [0, -45, 12], fx = U(fx0), fy = U(fy0), gap = Math.max(2, U(gp));
  const slot = grid(x, g, c, 0);
  const sprite = (rows: string[], cx: number, cy: number, col?: string, put = cell) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') put(cx + i, cy + j, 1, 1, col && r[i] === 'c' ? col : PAL[r[i]]); });
  x.save(); x.globalAlpha = g.alpha;
  s.trail.forEach(tr => { if (tr.length < 2) return; const a = tr[0], b = tr[tr.length - 1];
    if (b[2] > a[2] && Math.hypot(b[0] - a[0], b[1] - a[1]) / (b[2] - a[2]) >= 150) { x.save(); x.globalAlpha *= 0.5; line(U(a[0]), U(a[1]), U(b[0]), U(b[1]), g.accent); x.restore(); } });
  if (tg._barrage) hands.forEach(([hx, hy], i) => { for (let k = 1; k <= 4; k++) { x.save(); x.globalAlpha *= 0.6 - k * 0.1; cell(U(hx + Math.sin(g.t * 37 + k * 1.9 + i) * 9) - 1, U(hy - k * 6) - 1, 2, 2, g.accent); x.restore(); } });
  if (tg._orbs === 1 && hands.length === 2) { ring(U(hands[0][0]), U(hands[0][1] - 4), 2, 2, BLUE, true); ring(U(hands[1][0]), U(hands[1][1] - 4), 2, 2, RED, true); }
  else if (tg._orbs === 2) { const r = Math.max(1, U(4 + 10 * cl(tg._orbK ?? 1))); ring(0, U(-50), r, r, PURPLE, true); ring(0, U(-50), r, r, WHITE); }
  if (tg._thumb && hands[1]) cell(U(hands[1][0]), U(hands[1][1] - 12), Math.max(1, U(3.5)), Math.max(2, U(8)), g.accent);
  const K = cl(tg._faceK ?? 1);
  if (K > 0.3) switch (tg._face) {
    case 'glasses': for (const sd of [-1, 1]) ring(fx + sd * gap, fy, 2, 2, pen.ol); if ((g.t * 1.2) % 1 < 0.3) for (const sd of [-1, 1]) cell(fx + sd * gap, fy - 1, 1, 1, WHITE); break;
    case 'sparkle': for (const sd of [-1, 1]) { cell(fx + sd * gap - 1, fy - 2, 3, 4, '#1E1410'); cell(fx + sd * gap, fy - 2, 1, 1, WHITE); } break;
    case 'teeth': cell(fx - 2, fy + U(8), 5, Math.max(1, U(3)), WHITE); if (Math.floor(g.t * 9) % 2) sprite(SPR.spark!, fx + 4, fy + U(5)); break;
  }
  if (tg._lens && hands[1]) {
    const r = Math.max(2, U(15 * cl(tg._lensK ?? 1))), hx = U(hands[1][0]), hy = U(hands[1][1]), cx = hx + U(8), cy = hy - U(10);
    line(hx, hy, cx - Math.round(r * 0.7), cy + Math.round(r * 0.7), pen.ol);
    ring(cx, cy, r, r, '#C8E6FF', true);
    const off = Math.floor(g.t * 4) % 3;
    for (let i = 0; i < r; i += 3) { const row = cy - r + 1 + i + off; if (row < cy + r - 1) cell(cx - r + 2, row, Math.max(1, Math.min(2 * r - 4, Math.round(r * (0.6 + 0.8 * hr(i + Math.floor(g.t * 2)))))), 1, ['#1D9E75', '#D97757', '#5B8DEF'][i % 3]); }
    ring(cx, cy, r, r, pen.ol); cell(cx - Math.round(r / 2), cy - Math.round(r / 2), 1, 1, WHITE);
  }
  if (tg._orbit) {
    const k = cl(tg._orbitK ?? 1), idea = cl(tg._idea ?? 0);
    if (idea < 0.5) for (let i = 0; i < 3; i++) {
      const a = Math.floor(g.t * 10) / 10 * 1.6 + i * TAU / 3, px = fx0 + Math.cos(a) * 38 * k, py = fy0 - 30 + Math.sin(a) * 9;
      if (i === 0) text('?', px, py, AMBER); else icon(i === 1 ? ICON.gear : ICON.bulb, px, py, ICON_PAL);
    }
    else { icon(ICON.lit, fx0, fy0 - 58, ICON_PAL); for (let j = 0; j < 8; j++) { const a = j * TAU / 8; cell(fx + Math.round(Math.cos(a) * U(20)), U(fy0 - 58) + Math.round(Math.sin(a) * U(20)), 1, 1, AMBER); } }
  }
  if (tg._snot != null) { const r = Math.max(1, U(2 + 8 * cl(tg._snot))); ring(fx + 2 + r, fy + U(8), r, r, '#85B7EB'); }
  if (tg._dream != null) { const cx = U(38), cy = U(-104); ring(cx, cy, U(16), U(10), WHITE, true); ring(cx, cy, U(16), U(10), pen.ol);
    const ph = (tg._dream * 0.8) % 1; cell(cx - U(10) + Math.round(ph * U(20)), cy - Math.round(Math.sin(ph * PI) * U(8)), 2, 2, g.accent); cell(cx, cy + 1, 1, 2, pen.ol); }
  if (tg._shock && Math.floor(g.t * 12) % 2) for (let i = 0; i < 6; i++) { const a = -PI * (0.1 + 0.8 * i / 5);
    line(fx + Math.round(Math.cos(a) * U(24)), fy - U(14) + Math.round(Math.sin(a) * U(24)), fx + Math.round(Math.cos(a) * U(32)), fy - U(14) + Math.round(Math.sin(a) * U(32)), pen.ol); }
  for (const p of s.parts) {
    const px = slot.U(p.x), py = slot.U(p.y), k = p.life / p.max;
    x.save(); x.globalAlpha *= 1 - k * k;
    if (p.k === 'confetti') slot.cell(px, py, 1, 2, p.col);
    else if (p.k === 'bolt') { let ax = px, ay = py; for (let i = 1; i <= 4; i++) { const bx = px + Math.round(Math.cos(p.rot) * slot.U(p.s) * i / 4), by = py + Math.round(Math.sin(p.rot) * slot.U(p.s) * i / 4) + (i % 2 ? -1 : 1); slot.line(ax, ay, bx, by, p.col); ax = bx; ay = by; } }
    else if (p.k === 'smoke') slot.ring(px, py, 1 + Math.round(k * 2), 1 + Math.round(k * 2), '#E8E6E0', true);
    else sprite(SPR[p.k]!, px - 1, py - 1, p.k === 'helper' ? g.accent : undefined, slot.cell);
    x.restore();
  }
  // „!” obok głowy: glif pikselowy jest wysoki (≥ 9 px), więc stoi niżej niż wektorowy, żeby przy skokach nie wyjść z paska
  if (tg._bang) text('!', fx0 + 34, fy0 - 20 - Math.round(Math.abs(Math.sin(g.t * 8)) * 2) * 3, AMBER);
  // słowa pikselowe stoją w miejscu: glif jest wyższy niż wektorowy i unosząc się wyszedłby ponad pasek
  for (const w of s.words) slot.text(w.text, w.x, w.y + w.life * WORD_RISE, AMBER);
  x.restore();
}
