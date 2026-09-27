// Dymki nad zwierzakami (spec 0.8, 2.2): pytanie agenta i bieżąca akcja, w stylu zwierzaka.
// Współrzędne w px CSS okna dymków; `zoom` to skala sceny. Kształt: prostokąt z zaokrągleniem i ogonkiem u dołu.
import { ACCENT } from '../styles';
import type { Look } from '../types';
import { darken, lighten } from './color';
import { hr } from './math';
import { gridPx } from './models/pixel';
import { FONT_ROWS, glyphOf, textWidth } from './pixelfont';

export type BubbleKind = 'question' | 'action';
/** Wymiary dymku razem z ogonkiem (px CSS). */
export interface BubbleBox { w: number; h: number }

/** Najszerszy dymek (px CSS przy zoom 1): 40 znaków zwykłej czcionki z zapasem. */
export const BUBBLE_MAX_W = 300;
const FONT_PX = 12, PAD_X = 10, PAD_Y = 5, LINE = 16, RADIUS = 11, TAIL_H = 7, TAIL_W = 6;
/** Ciepły kolor pytania (spec 2.2: pytanie zawsze ma pomarańczowe tło albo akcent). */
const AMBER = '#EF9F27';

interface Paint {
  fill: string; stroke: string; lineW: number; text: string; weight: number;
  /** odręczna kreska: drganie w px CSS i liczba przejść */
  hand?: { jitter: number; passes: number };
  glow?: string; shadow?: boolean; rim?: string;
}

function paint(look: Look, kind: BubbleKind, accent: string): Paint {
  const q = kind === 'question';
  switch (look.style) {
    case 'sticker': return { fill: q ? '#FFE7BF' : '#FFFDF7', stroke: '#FFFFFF', lineW: 2.5, text: '#2A2622', weight: 600, shadow: true, rim: '#FFFFFF' };
    case 'sketch': return { fill: q ? '#FFE7BF' : '#FFFDF7', stroke: q ? '#8A5A14' : '#3B3A38', lineW: 1.1, text: '#2A2622', weight: 600, hand: { jitter: 1.6, passes: 3 } };
    case 'ink': return { fill: q ? '#FFE7BF' : '#FFFFFF', stroke: '#111111', lineW: 1.8, text: '#111111', weight: 600, hand: { jitter: 1.2, passes: 2 } };
    case 'neon': { const c = q ? AMBER : lighten(accent, 0.25); return { fill: q ? '#2A1A08' : '#15131A', stroke: c, lineW: 1.5, text: '#F6F2EA', weight: 600, glow: c }; }
    case 'pastel': return { fill: q ? '#FFEBD2' : '#FDF8F3', stroke: q ? darken('#FFD3A1', 0.3) : '#B9A89C', lineW: 1.2, text: '#6B5D55', weight: 500 };
    case 'pixel': return { fill: q ? '#FFD98A' : '#FFFFFF', stroke: '#2B1D16', lineW: 1, text: '#2B1D16', weight: 400 };
    default: return { fill: q ? '#FFF4E2' : '#FFFFFF', stroke: q ? '#C97A1A' : '#5C5650', lineW: 1.5, text: '#33302B', weight: 500 };
  }
}

const font = (p: Paint, zoom: number) => `${p.weight} ${FONT_PX * zoom}px "Segoe UI", system-ui, sans-serif`;

/** Komórka pikselowej ramki i czcionki w px CSS: całe piksele urządzenia. */
const pixelCells = (zoom: number, dpr: number) => ({
  g: gridPx(0.3 * zoom, dpr) / dpr,
  t: Math.max(1, Math.round(zoom * dpr)) / dpr,
});

/** Tekst przycięty do szerokości (zwykle już ma ≤ 40 znaków z rdzenia; szerokie litery mogą nie zmieścić się w pikselach). */
function fit(text: string, max: number, width: (s: string) => number): string {
  if (width(text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && width(chars.join('') + '…') > max) chars.pop();
  return chars.join('') + '…';
}

/** Pikselowy dymek w całych komórkach ramki: to samo dla pomiaru i rysowania (przy skali ekranu `dpr`). */
function pixelGeom(text: string, zoom: number, dpr: number) {
  const { g, t } = pixelCells(zoom, dpr);
  const pad = 3 * g, maxText = BUBBLE_MAX_W * zoom - 2 * pad;
  const shown = fit(text, maxText, s => textWidth(s) * t);
  const cw = Math.max(6, Math.ceil((textWidth(shown) * t + 2 * pad) / g)), chh = Math.ceil((FONT_ROWS * t + 2 * pad) / g);
  return { g, t, shown, cw, chh };
}

/** `dpr`: skala ekranu; pikselowy dymek ma inną szerokość przy 125 % czy 150 %, a układ musi znać tę prawdziwą. */
export function measureBubble(ctx: CanvasRenderingContext2D, text: string, look: Look, zoom: number, dpr = 1): BubbleBox {
  if (look.style === 'pixel') {
    // ramka na `chh` komórek i dwa rzędy ogonka pod nią
    const { g, cw, chh } = pixelGeom(text, zoom, dpr);
    return { w: cw * g, h: (chh + 2) * g };
  }
  ctx.save();
  ctx.font = font(paint(look, 'action', ACCENT.clawd), zoom);
  const maxText = (BUBBLE_MAX_W - 2 * PAD_X) * zoom;
  const tw = Math.min(maxText, ctx.measureText(text).width);
  ctx.restore();
  return { w: tw + 2 * PAD_X * zoom, h: (LINE + 2 * PAD_Y + TAIL_H) * zoom };
}

/** Obrys dymku z ogonkiem jako wielokąt (łuki rogów z odcinków), w kolejności zgodnej z ruchem wskazówek. */
function outline(x: number, y: number, w: number, h: number, r: number, tx: number, th: number, tw: number): number[][] {
  const p: number[][] = [], n = 5;
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * i / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  p.push([tx + tw, y + h], [tx, y + h + th], [tx - tw, y + h]);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return p;
}

function trace(ctx: CanvasRenderingContext2D, pts: number[][], jitter: number, seed: number): void {
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const dx = jitter ? (hr(seed + i * 1.7) - 0.5) * jitter : 0, dy = jitter ? (hr(seed + i * 2.3 + 50) - 0.5) * jitter : 0;
    if (i) ctx.lineTo(px + dx, py + dy); else ctx.moveTo(px + dx, py + dy);
  });
  ctx.closePath();
}

/**
 * Rysuje dymek z lewym górnym rogiem w (x, y); ogonek wskazuje `tailX` (względem x, przycięte do dymku).
 * `accent`: kolor agenta (obwódka Neonu).
 */
export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, kind: BubbleKind, look: Look,
  tailX: number, zoom: number, dpr: number, accent: string = ACCENT.clawd): void {
  const p = paint(look, kind, accent);
  if (look.style === 'pixel') { drawPixelBubble(ctx, x, y, text, p, tailX, zoom, dpr); return; }
  const box = measureBubble(ctx, text, look, zoom);
  const w = box.w, h = (LINE + 2 * PAD_Y) * zoom, r = RADIUS * zoom, tw = TAIL_W * zoom, th = TAIL_H * zoom;
  const tx = x + Math.min(w - r - tw, Math.max(r + tw, tailX));
  const pts = outline(x, y, w, h, r, tx, th, tw);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = p.fill;
  if (p.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8 * zoom; ctx.shadowOffsetY = 3 * zoom; }
  trace(ctx, pts, 0, 0);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = p.stroke;
  ctx.lineWidth = p.lineW * zoom;
  if (p.glow) { ctx.shadowColor = p.glow; ctx.shadowBlur = 8 * zoom; ctx.shadowOffsetY = 0; }
  const passes = p.hand?.passes ?? 1, seed = Math.round(x * 7 + y * 13);
  for (let i = 0; i < passes; i++) {
    if (i) { ctx.globalAlpha = 0.5; ctx.lineWidth = p.lineW * zoom * 0.6; }
    trace(ctx, pts, (p.hand?.jitter ?? 0) * zoom * (1 + i * 0.6), seed + i * 29);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = p.text;
  ctx.font = font(p, zoom);
  ctx.textBaseline = 'middle';
  const shown = fit(text, w - 2 * PAD_X * zoom, s => ctx.measureText(s).width);
  ctx.fillText(shown, x + PAD_X * zoom, y + h / 2 + 0.5 * zoom);
  ctx.restore();
}

/** Pikselowy dymek: ramka o grubości jednej komórki `gridPx`, ścięte rogi, schodkowy ogonek, tekst z `pixelfont`. */
function drawPixelBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, p: Paint, tailX: number, zoom: number, dpr: number): void {
  const { g, t, shown, cw, chh } = pixelGeom(text, zoom, dpr);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const X = snap(x), Y = snap(y);
  const rect = (cx: number, cy: number, w: number, h: number) => ctx.fillRect(X + cx * g, Y + cy * g, w * g, h * g);
  ctx.save();
  ctx.fillStyle = p.stroke;
  rect(1, 0, cw - 2, 1); rect(1, chh - 1, cw - 2, 1); rect(0, 1, 1, chh - 2); rect(cw - 1, 1, 1, chh - 2);
  ctx.fillStyle = p.fill;
  rect(1, 1, cw - 2, chh - 2);
  // ogonek: trzy schodki w dół, środkiem pod zwierzakiem
  const tc = Math.min(cw - 4, Math.max(3, Math.round(tailX / g)));
  ctx.fillStyle = p.fill;
  rect(tc - 1, chh - 1, 3, 1);
  ctx.fillStyle = p.stroke;
  rect(tc - 2, chh - 1, 1, 1); rect(tc + 2, chh - 1, 1, 1);
  rect(tc - 1, chh, 1, 1); rect(tc + 1, chh, 1, 1);
  ctx.fillStyle = p.fill;
  rect(tc, chh, 1, 1);
  ctx.fillStyle = p.stroke;
  rect(tc, chh + 1, 1, 1);
  // tekst: komórka czcionki = całe piksele urządzenia, początek na siatce ramki
  ctx.fillStyle = p.text;
  const tx0 = X + 3 * g, ty0 = Y + Math.round((chh * g - FONT_ROWS * t) / 2 * dpr) / dpr;
  let cx = 0;
  for (const ch of Array.from(shown)) {
    const rows = glyphOf(ch);
    rows.forEach((row, ry) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(tx0 + (cx + i) * t, ty0 + ry * t, t, t);
    });
    cx += (rows[0]?.length ?? 1) + 1;
  }
  ctx.restore();
}
