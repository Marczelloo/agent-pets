// Efekty Dynamiczny dla modeli wektorowego i naklejki: tło akcji, krąg na ziemi, błysk za zwierzakiem (tył);
// cząsteczki, smugi, wachlarz pięści, nakładki twarzy, kule, onomatopeje (przód). Tylko geometria bieżącej klatki.
import { PI, TAU, cl, hr } from '../../renderer/math';
import { pen } from '../../renderer/pen';
import type { FxState, Particle } from '../../renderer/dynamic/state';
import type { Pet } from '../../renderer/pet';
import type { FxCtx } from './index';

export const SLOT = { w: 150, h: 140 };
const AMBER = '#EF9F27', WHITE = '#FFFFFF', RED = '#E24B4A', BLUE = '#5B8DEF', PURPLE = '#7F77DD', TEAL = '#5DCAA5';

const rays = (x: CanvasRenderingContext2D, cx: number, cy: number, r0: number, r1: number, n: number, seed: number) => {
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const a = TAU * (i + hr(i + seed) * 0.6) / n, k = 0.8 + 0.4 * hr(i * 3.1 + seed);
    x.moveTo(cx + Math.cos(a) * r0 * k, cy + Math.sin(a) * r0 * k); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  x.stroke();
};

export function vectorBack(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const tg = c.tg || {}, u = g.u, XX = g.X + c.p.lx.x * u, Y = g.Y;
  const bg = g.env.bg ? tg._bg : null, gr = tg._ground && cl(tg._groundK ?? 1) > 0.02 ? tg._ground : null;
  if (!bg && !gr && !g.flash) return;
  x.save();
  x.globalAlpha = g.alpha;
  x.beginPath(); x.rect(XX - 75 * u, Y - 135 * u, SLOT.w * u, SLOT.h * u); x.clip();
  const cx = XX, cy = Y - 40 * u, seed = Math.floor(g.t * 12), k = cl(tg._bgK ?? 1);
  x.lineCap = 'round';
  if (g.flash) {
    x.fillStyle = WHITE; x.beginPath(); x.arc(cx, cy, 70 * u, 0, TAU); x.fill();
    x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 2 * u); rays(x, cx, cy, 34 * u, 78 * u, 14, seed);
  } else if (bg === 'speed' || bg === 'purple') {
    x.globalAlpha = g.alpha * k * 0.35;
    x.strokeStyle = bg === 'purple' ? PURPLE : pen.ol; x.lineWidth = Math.max(1, 1.6 * u);
    rays(x, cx, cy, 52 * u, 80 * u, 18, seed);
  } else if (bg === 'rays') {
    x.globalAlpha = g.alpha * k * 0.3; x.fillStyle = AMBER;
    for (let i = 0; i < 10; i++) { const a = TAU * i / 10 + g.t * 0.3; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, 90 * u, a, a + TAU / 20); x.closePath(); x.fill(); }
  } else if (bg === 'wind') {
    x.globalAlpha = g.alpha * k * 0.4; x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 1.4 * u); x.beginPath();
    for (let i = 0; i < 6; i++) { const yy = cy - 40 * u + i * 14 * u, off = ((g.t * 160 + i * 37) % 150) * u; x.moveTo(XX - 75 * u + off, yy); x.lineTo(XX - 75 * u + off + 22 * u, yy); }
    x.stroke();
  }
  if (gr) {
    const gx = XX + (tg._groundX ?? 0) * u, col = gr === 'seal' ? RED : TEAL, gk = cl(tg._groundK ?? 1);
    x.globalAlpha = g.alpha * gk; x.strokeStyle = col; x.lineWidth = Math.max(1, 1.8 * u);
    for (const r of [34, 26]) { x.beginPath(); x.ellipse(gx, Y, r * u, r * 0.26 * u, 0, 0, TAU); x.stroke(); }
    x.beginPath();
    for (let i = 0; i < 8; i++) { const a = TAU * i / 8 + g.t * (gr === 'seal' ? 1 : -2); x.moveTo(gx + Math.cos(a) * 26 * u, Y + Math.sin(a) * 6.8 * u); x.lineTo(gx + Math.cos(a) * 34 * u, Y + Math.sin(a) * 8.8 * u); }
    x.stroke();
  }
  x.restore();
}

function particle(x: CanvasRenderingContext2D, p: Particle, u: number, XX: number, Y: number) {
  const k = p.life / p.max, px = XX + p.x * u, py = Y + p.y * u, s = p.s * u;
  x.save(); x.globalAlpha *= 1 - k * k; x.translate(px, py); x.fillStyle = p.col; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
  switch (p.k) {
    case 'spark': { const r = s * (1 - k * 0.6); x.strokeStyle = p.col; x.lineWidth = Math.max(1, 1.8 * u); x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.moveTo(0, -r); x.lineTo(0, r); x.stroke(); break; }
    case 'dust': case 'smoke': x.beginPath(); x.arc(0, 0, s * (0.6 + k), 0, TAU); x.fill(); if (p.k === 'smoke') { x.strokeStyle = '#B4B2A9'; x.stroke(); } break;
    case 'key': x.rotate(p.rot); x.beginPath(); x.rect(-s / 2, -s / 2, s, s); x.fill(); x.stroke(); x.fillStyle = '#B4B2A9'; x.fillRect(-s / 4, -s / 4, s / 2, s / 2); break;
    case 'page': x.rotate(p.rot); x.scale(Math.cos(p.life * 7), 1); x.beginPath(); x.rect(-s * 0.4, -s / 2, s * 0.8, s); x.fill(); x.stroke();
      x.beginPath(); for (let i = 0; i < 3; i++) { x.moveTo(-s * 0.25, -s * 0.25 + i * s * 0.25); x.lineTo(s * 0.25, -s * 0.25 + i * s * 0.25); } x.strokeStyle = '#B4B2A9'; x.stroke(); break;
    case 'confetti': x.rotate(p.rot); x.fillRect(-s * 0.3, -s * 0.6, s * 0.6, s * 1.2); break;
    case 'bolt': { x.rotate(p.rot); x.strokeStyle = p.col; x.lineWidth = Math.max(1.2, 2.4 * u); x.beginPath(); x.moveTo(0, 0);
      for (let i = 1; i <= 4; i++) x.lineTo(s * i / 4, (i % 2 ? -1 : 1) * s * 0.18); x.stroke(); x.strokeStyle = WHITE; x.lineWidth = Math.max(0.6, u); x.stroke(); break; }
    case 'energy': x.beginPath(); x.arc(0, 0, s, 0, TAU); x.fill(); x.globalAlpha *= 0.4; x.beginPath(); x.arc(0, 0, s * 2, 0, TAU); x.fill(); break;
    case 'note': x.font = `${Math.max(9, s)}px ${pen.font}`; x.textAlign = 'center'; x.fillText('♪', 0, 0); break;
    case 'tear': x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.9, s * 0.3, 0, s * 0.6); x.quadraticCurveTo(-s * 0.9, s * 0.3, 0, -s); x.fill(); x.stroke(); break;
    case 'soul': x.globalAlpha *= 0.85; x.beginPath(); x.arc(0, 0, s, PI, 0); x.lineTo(s, s * 1.2); x.quadraticCurveTo(0, s * (0.8 + 0.3 * Math.sin(p.life * 9)), -s, s * 1.2); x.closePath(); x.fill(); x.strokeStyle = '#B4B2A9'; x.stroke();
      x.fillStyle = pen.ol; x.fillRect(-s * 0.4, -s * 0.2, s * 0.18, s * 0.3); x.fillRect(s * 0.22, -s * 0.2, s * 0.18, s * 0.3); break;
    case 'helper': { const hop = Math.abs(Math.sin(p.life * 18)) * 3 * u; x.fillStyle = p.col; x.beginPath(); x.rect(-s / 2, -s * 0.75 - hop, s, s * 0.75); x.fill(); x.stroke();
      x.beginPath(); for (const lx of [-0.25, 0.25]) { const sw = Math.sin(p.life * 18 + lx * 9) * 2 * u; x.moveTo(lx * s, -hop); x.lineTo(lx * s + sw, 0); } x.stroke(); break; }
  }
  x.restore();
}

function smear(x: CanvasRenderingContext2D, tr: [number, number, number][], u: number, XX: number, Y: number, col: string) {
  if (tr.length < 2) return;
  const a = tr[0], b = tr[tr.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), span = b[2] - a[2];
  if (span <= 0 || d / span < 150) return;
  const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d;
  x.save(); x.globalAlpha *= 0.45; x.fillStyle = col; x.beginPath();
  tr.forEach((p, i) => { const w = 6 * u * i / (tr.length - 1); const px = XX + p[0] * u + nx * w, py = Y + p[1] * u + ny * w; if (i) x.lineTo(px, py); else x.moveTo(px, py); });
  for (let i = tr.length - 1; i >= 0; i--) { const p = tr[i], w = 6 * u * i / (tr.length - 1); x.lineTo(XX + p[0] * u - nx * w, Y + p[1] * u - ny * w); }
  x.closePath(); x.fill(); x.restore();
}

function face(x: CanvasRenderingContext2D, c: Pet, g: FxCtx, XX: number, Y: number) {
  const tg = c.tg || {}, u = g.u, kind = tg._face, K = cl(tg._faceK ?? 1);
  const [fx0, fy0, gp] = (c.face as number[]) ?? [0, -45, 12], fx = XX + fx0 * u, fy = Y + fy0 * u, gap = gp * u;
  x.save(); x.globalAlpha *= K; x.lineWidth = Math.max(1, 1.6 * u); x.strokeStyle = pen.ol;
  if (kind === 'glasses') {
    for (const s of [-1, 1]) { x.beginPath(); x.arc(fx + s * gap, fy, 7 * u, 0, TAU); x.stroke(); }
    x.beginPath(); x.moveTo(fx - gap + 7 * u, fy); x.lineTo(fx + gap - 7 * u, fy); x.stroke();
    const gl = (g.t * 1.2) % 1;
    if (gl < 0.3) { x.strokeStyle = WHITE; x.lineWidth = Math.max(1, 2 * u); x.beginPath(); for (const s of [-1, 1]) { const o = (gl / 0.3 - 0.5) * 10 * u; x.moveTo(fx + s * gap + o - 3 * u, fy + 4 * u); x.lineTo(fx + s * gap + o + 3 * u, fy - 4 * u); } x.stroke(); }
  } else if (kind === 'sparkle') {
    for (const s of [-1, 1]) {
      x.fillStyle = '#1E1410'; x.beginPath(); x.ellipse(fx + s * gap, fy, 6 * u, 8 * u, 0, 0, TAU); x.fill();
      x.fillStyle = WHITE; x.beginPath(); x.arc(fx + s * gap + 2 * u, fy - 3 * u, 2.4 * u, 0, TAU); x.fill();
      x.beginPath(); x.arc(fx + s * gap - 2 * u, fy + 3 * u, 1.2 * u, 0, TAU); x.fill();
    }
  } else if (kind === 'teeth') {
    x.fillStyle = WHITE; x.beginPath(); x.rect(fx - 6 * u, fy + 7 * u, 12 * u, 4 * u); x.fill(); x.stroke();
    const tw = 0.6 + 0.4 * Math.abs(Math.sin(g.t * 9)), sx = fx + 10 * u, sy = fy + 6 * u;
    x.strokeStyle = AMBER; x.lineWidth = Math.max(1, 1.8 * u); x.beginPath(); x.moveTo(sx - 5 * u * tw, sy); x.lineTo(sx + 5 * u * tw, sy); x.moveTo(sx, sy - 5 * u * tw); x.lineTo(sx, sy + 5 * u * tw); x.stroke();
  }
  x.restore();
}

/** Myśli (Shikamaru): „?”, trybik i żarówka krążą wokół głowy; `idea` zapala nad głową dużą żarówkę z promieniami. */
function thinking(x: CanvasRenderingContext2D, g: FxCtx, fx: number, fy: number, k: number, idea: number) {
  const u = g.u, S = 24 * u, cy = fy - 40 * u;
  x.save(); x.lineWidth = Math.max(1, 1.6 * u); x.strokeStyle = pen.ol;
  for (let i = 0; i < 3; i++) {
    const a = g.t * 1.6 + i * TAU / 3, px = fx + Math.cos(a) * 42 * u * k, py = cy + Math.sin(a) * 9 * u, front = Math.sin(a) > 0;
    x.save(); x.globalAlpha *= k * (front ? 1 : 0.6) * (1 - 0.7 * idea); x.translate(px, py);
    if (i === 0) {
      x.font = `900 ${Math.max(9, S)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = Math.max(1.5, 2.5 * u);
      x.strokeText('?', 0, 0); x.fillStyle = AMBER; x.fillText('?', 0, 0);
    } else if (i === 1) {
      x.rotate(g.t * 2); x.fillStyle = '#B4B2A9'; x.beginPath();
      for (let j = 0; j < 6; j++) { x.save(); x.rotate(j * TAU / 6); x.rect(-S * 0.08, -S * 0.46, S * 0.16, S * 0.16); x.restore(); }
      x.fill(); x.beginPath(); x.arc(0, 0, S * 0.33, 0, TAU); x.fill(); x.stroke();
      x.fillStyle = WHITE; x.beginPath(); x.arc(0, 0, S * 0.12, 0, TAU); x.fill(); x.stroke();
    } else bulb(x, 0, 0, S * 0.32, false);
    x.restore();
  }
  if (idea > 0.02) {
    const by = fy - 58 * u, r = 11 * u * idea;
    x.save(); x.strokeStyle = AMBER; x.lineWidth = Math.max(1, 2 * u); x.beginPath();
    for (let j = 0; j < 8; j++) { const a = j * TAU / 8; x.moveTo(fx + Math.cos(a) * r * 1.4, by + Math.sin(a) * r * 1.4); x.lineTo(fx + Math.cos(a) * r * 2, by + Math.sin(a) * r * 2); }
    x.stroke(); x.restore();
    bulb(x, fx, by, r, true);
  }
  x.restore();
}

function bulb(x: CanvasRenderingContext2D, bx: number, by: number, r: number, lit: boolean) {
  x.fillStyle = lit ? '#F5D547' : '#F1EFE8'; x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = '#B4B2A9'; x.beginPath(); x.rect(bx - r * 0.45, by + r * 0.85, r * 0.9, r * 0.55); x.fill(); x.stroke();
}

/** Wielka lupa detektywa przy prawej dłoni: szkło z powiększonymi liniami kodu, obręcz, rączka, błysk. */
function lens(x: CanvasRenderingContext2D, g: FxCtx, hx: number, hy: number, k: number) {
  const u = g.u, r = 20 * u * k, cx = hx + 10 * u, cy = hy - 14 * u;
  if (r < u) return;
  x.save(); x.strokeStyle = pen.ol; x.lineWidth = Math.max(1.4, 2.6 * u);
  x.beginPath(); x.moveTo(hx, hy); x.lineTo(cx - r * 0.7, cy + r * 0.7); x.stroke();
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = 'rgba(200,230,255,0.55)'; x.fill(); x.clip();
  const off = (g.t * 14 * u) % (7 * u), cols = ['#1D9E75', '#D97757', '#5B8DEF', '#7F77DD'];
  for (let i = 0; i < 5; i++) { x.fillStyle = cols[i % 4]; x.fillRect(cx - r * 0.8, cy - r + i * 7 * u - off + 3 * u, r * (0.6 + 0.8 * hr(i + Math.floor(g.t * 2))), 3 * u); }
  x.restore();
  x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.stroke();
  x.strokeStyle = WHITE; x.lineWidth = Math.max(1, 1.8 * u); x.beginPath(); x.arc(cx, cy, r * 0.7, 1.1 * PI, 1.45 * PI); x.stroke();
  x.restore();
}

export function vectorFront(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void {
  const tg = c.tg || {}, s: FxState | undefined = c.fx, u = g.u, XX = g.X + c.p.lx.x * u, Y = g.Y;
  if (!s) return;
  const hands: number[][] = c.hand ?? [];
  const [fx0, fy0] = (c.face as number[]) ?? [0, -45], fx = XX + fx0 * u, fy = Y + fy0 * u;
  x.save(); x.globalAlpha = g.alpha; x.lineCap = 'round'; x.lineJoin = 'round';
  s.trail.forEach(tr => smear(x, tr, u, XX, Y, g.accent));
  if (tg._barrage) hands.forEach(([hx, hy], i) => {
    for (let k = 1; k <= 4; k++) {
      const px = XX + (hx + Math.sin(g.t * 37 + k * 1.9 + i) * 9) * u, py = Y + (hy - k * 6) * u;
      x.save(); x.globalAlpha *= 0.55 - k * 0.1; x.fillStyle = g.accent; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
      x.beginPath(); x.arc(px, py, 5.5 * u, 0, TAU); x.fill(); x.stroke(); x.restore();
    }
  });
  if (tg._orbs === 1 && hands.length === 2) {
    [[hands[0], BLUE], [hands[1], RED]].forEach(([h, col]) => { const [hx, hy] = h as number[]; x.fillStyle = col as string;
      x.save(); x.globalAlpha *= 0.35; x.beginPath(); x.arc(XX + hx * u, Y + (hy - 4) * u, 10 * u, 0, TAU); x.fill(); x.restore();
      x.beginPath(); x.arc(XX + hx * u, Y + (hy - 4) * u, 6 * u, 0, TAU); x.fill(); });
  } else if (tg._orbs === 2) {
    const r = (4 + 10 * cl(tg._orbK ?? 1)) * u; x.fillStyle = PURPLE;
    x.save(); x.globalAlpha *= 0.35; x.beginPath(); x.arc(XX, Y - 50 * u, r * 1.6, 0, TAU); x.fill(); x.restore();
    x.beginPath(); x.arc(XX, Y - 50 * u, r, 0, TAU); x.fill(); x.strokeStyle = WHITE; x.lineWidth = Math.max(1, 1.4 * u); x.stroke();
  }
  if (tg._thumb && hands[1]) { const [hx, hy] = hands[1]; x.fillStyle = g.accent; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
    x.beginPath(); x.rect(XX + (hx - 1.5) * u, Y + (hy - 12) * u, 3.5 * u, 8 * u); x.fill(); x.stroke(); }
  face(x, c, g, XX, Y);
  if (tg._lens && hands[1]) lens(x, g, XX + hands[1][0] * u, Y + hands[1][1] * u, cl(tg._lensK ?? 1));
  if (tg._orbit) thinking(x, g, fx, fy, cl(tg._orbitK ?? 1), cl(tg._idea ?? 0));
  if (tg._snot != null) { const r = (2 + 8 * cl(tg._snot)) * u, bx = fx + 4 * u + r * 0.6, by = fy + 8 * u;
    x.fillStyle = 'rgba(170,220,255,0.5)'; x.strokeStyle = '#85B7EB'; x.lineWidth = Math.max(0.8, 1.2 * u);
    x.beginPath(); x.arc(bx, by, r, 0, TAU); x.fill(); x.stroke(); x.fillStyle = WHITE; x.beginPath(); x.arc(bx - r * 0.35, by - r * 0.35, r * 0.2, 0, TAU); x.fill(); }
  if (tg._dream != null) { const cx = XX + 38 * u, cy = Y - 104 * u; x.fillStyle = WHITE; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, 1.2 * u);
    for (const [ox, oy, r] of [[-8, 2, 9], [0, -3, 11], [9, 1, 9]]) { x.beginPath(); x.arc(cx + ox * u, cy + oy * u, r * u, 0, TAU); x.fill(); x.stroke(); }
    for (const [ox, oy, r] of [[-22, 18, 2.5], [-28, 26, 1.6]]) { x.beginPath(); x.arc(cx + ox * u, cy + oy * u, r * u, 0, TAU); x.fill(); x.stroke(); }
    const ph = (tg._dream * 0.8) % 1, jx = cx + (-10 + 20 * ph) * u, jy = cy + 4 * u - Math.sin(ph * PI) * 8 * u;
    x.beginPath(); x.moveTo(cx, cy + 6 * u); x.lineTo(cx, cy); x.stroke();
    x.fillStyle = g.accent; x.beginPath(); x.rect(jx - 3 * u, jy - 4 * u, 6 * u, 4 * u); x.fill(); x.stroke(); }
  if (tg._shock) { x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 1.6 * u); x.beginPath();
    for (let i = 0; i < 6; i++) { const a = -PI * (0.1 + 0.8 * i / 5), j = Math.floor(g.t * 12) % 2 ? 2 : 0; x.moveTo(fx + Math.cos(a) * (24 + j) * u, fy - 14 * u + Math.sin(a) * (24 + j) * u); x.lineTo(fx + Math.cos(a) * (32 + j) * u, fy - 14 * u + Math.sin(a) * (32 + j) * u); }
    x.stroke(); }
  // cząsteczki i słowa żyją w miejscu zwierzaka (g.X), nie jadą z nim przy `lx` (np. kurz za uciekającym)
  for (const p of s.parts) particle(x, p, u, g.X, Y);
  if (tg._bang) { const yy = fy - 20 * u - Math.abs(Math.sin(g.t * 8)) * 6 * u; // środek „!”: mieści się w pasku także przy skokach
    x.fillStyle = AMBER; x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 2 * u); x.font = `900 ${Math.max(12, 34 * u)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.strokeText('!', fx + 34 * u, yy); x.fillText('!', fx + 34 * u, yy); }
  for (const w of s.words) {
    const pop = w.life < 0.08 ? 1.4 - w.life * 5 : 1, fade = w.life > w.max * 0.7 ? (w.max - w.life) / (w.max * 0.3) : 1;
    x.save(); x.globalAlpha *= fade; x.font = `900 ${Math.max(9, w.s * u * pop)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = Math.max(1.5, 3 * u); x.strokeStyle = pen.ol; x.strokeText(w.text, g.X + w.x * u, Y + w.y * u);
    x.fillStyle = AMBER; x.fillText(w.text, g.X + w.x * u, Y + w.y * u); x.restore();
  }
  x.restore();
}
