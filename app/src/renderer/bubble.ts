// Bubbles above pets (spec 0.8, 2.2): agent question and current action, in the pet's style.
// Coordinates in bubble-window CSS px; `zoom` is stage scale. Shape: rounded rectangle with a tail below.
import { ACCENT } from '../styles';
import type { Look } from '../types';
import { darken, lighten } from './color';
import { hr } from './math';
import { gridPx } from './models/pixel';
import { FONT_ROWS, glyphOf, textWidth } from './pixelfont';

export type BubbleKind = 'question' | 'action';
/** Bubble dimensions including the tail (CSS px). */
export interface BubbleBox { w: number; h: number }

/** Maximum bubble width (CSS px at zoom 1): room for 40 regular-font characters plus padding. */
export const BUBBLE_MAX_W = 300;
/** Hover-expanded bubble: wider and multiline (full question or command). */
export const BUBBLE_WIDE_W = 340;
export const BUBBLE_MAX_LINES = 5;
const FONT_PX = 12, PAD_X = 10, PAD_Y = 5, LINE = 16, RADIUS = 11, TAIL_H = 7, TAIL_W = 6;
/** Warm question color (spec 2.2: a question always has an orange background or accent). */
const AMBER = '#EF9F27';

interface Paint {
  fill: string; stroke: string; lineW: number; text: string; weight: number;
  /** hand-drawn stroke: jitter in CSS px and number of passes */
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

/** Pixel border and font cell in CSS px: whole device pixels. */
const pixelCells = (zoom: number, dpr: number) => ({
  g: gridPx(0.3 * zoom, dpr) / dpr,
  t: Math.max(1, Math.round(zoom * dpr)) / dpr,
});

/** Text clipped to width (usually already ≤ 40 characters from core; wide letters may not fit in pixels). */
function fit(text: string, max: number, width: (s: string) => number): string {
  if (width(text) <= max) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && width(chars.join('') + '…') > max) chars.pop();
  return chars.join('') + '…';
}

/**
 * Text in lines no wider than `max`: wrap at spaces, split overly long words by character;
 * after `maxLines`, discard the rest and end the last line with an ellipsis.
 */
export function layoutLines(text: string, max: number, width: (s: string) => number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const push = (l: string) => { lines.push(l); cur = ''; };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (width(next) <= max) { cur = next; continue; }
    if (cur) push(cur);
    let w = word;
    while (width(w) > max) {
      const chars = Array.from(w);
      let n = chars.length - 1;
      while (n > 1 && width(chars.slice(0, n).join('')) > max) n--;
      push(chars.slice(0, n).join(''));
      w = chars.slice(n).join('');
    }
    cur = w;
  }
  if (cur) push(cur);
  if (lines.length <= maxLines) return lines.length ? lines : [''];
  const out = lines.slice(0, maxLines);
  out[maxLines - 1] = fit(`${out[maxLines - 1]} ${lines[maxLines]}`, max, width);
  if (!out[maxLines - 1].endsWith('…')) out[maxLines - 1] = fit(out[maxLines - 1] + '…', max, width);
  return out;
}

/** Pixel bubble in whole border cells: same geometry for measuring and drawing (at display scale `dpr`). */
function pixelGeom(text: string, zoom: number, dpr: number, wrap = false) {
  const { g, t } = pixelCells(zoom, dpr);
  const pad = 3 * g, maxText = (wrap ? BUBBLE_WIDE_W : BUBBLE_MAX_W) * zoom - 2 * pad, tw = (s: string) => textWidth(s) * t;
  const lines = wrap ? layoutLines(text, maxText, tw, BUBBLE_MAX_LINES) : [fit(text, maxText, tw)];
  const lineH = (FONT_ROWS + 2) * t;
  const cw = Math.max(6, Math.ceil((Math.max(...lines.map(tw)) + 2 * pad) / g));
  const chh = Math.ceil((FONT_ROWS * t + (lines.length - 1) * lineH + 2 * pad) / g);
  return { g, t, lines, lineH, cw, chh };
}

/** `dpr`: display scale; a pixel bubble has a different width at 125% or 150%, and layout needs the actual width. */
/** Text lines of a regular bubble (no wrapping: one line clipped to width). */
function textLines(ctx: CanvasRenderingContext2D, text: string, zoom: number, wrap: boolean): string[] {
  const w = (s: string) => ctx.measureText(s).width;
  if (!wrap) return [fit(text, (BUBBLE_MAX_W - 2 * PAD_X) * zoom, w)];
  return layoutLines(text, (BUBBLE_WIDE_W - 2 * PAD_X) * zoom, w, BUBBLE_MAX_LINES);
}

/** `wrap`: expanded (hovered) bubble with full text over multiple lines. */
export function measureBubble(ctx: CanvasRenderingContext2D, text: string, look: Look, zoom: number, dpr = 1, wrap = false): BubbleBox {
  if (look.style === 'pixel') {
    // border of `chh` cells and two tail rows below
    const { g, cw, chh } = pixelGeom(text, zoom, dpr, wrap);
    return { w: cw * g, h: (chh + 2) * g };
  }
  ctx.save();
  ctx.font = font(paint(look, 'action', ACCENT.clawd), zoom);
  const lines = textLines(ctx, text, zoom, wrap);
  const tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  ctx.restore();
  return { w: tw + 2 * PAD_X * zoom, h: (lines.length * LINE + 2 * PAD_Y + TAIL_H) * zoom };
}

/** Bubble outline with tail as a polygon (corner arcs made of segments), clockwise. */
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
 * Draw a bubble with top left at (x, y); the tail points to `tailX` (relative to x, clamped to the bubble).
 * `accent`: agent color (Neon border).
 */
export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, kind: BubbleKind, look: Look,
  tailX: number, zoom: number, dpr: number, accent: string = ACCENT.clawd, wrap = false): void {
  const p = paint(look, kind, accent);
  if (look.style === 'pixel') { drawPixelBubble(ctx, x, y, text, p, tailX, zoom, dpr, wrap); return; }
  const box = measureBubble(ctx, text, look, zoom, dpr, wrap);
  const w = box.w, h = box.h - TAIL_H * zoom, r = RADIUS * zoom, tw = TAIL_W * zoom, th = TAIL_H * zoom;
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
  textLines(ctx, text, zoom, wrap).forEach((l, i) => ctx.fillText(l, x + PAD_X * zoom, y + (PAD_Y + LINE * (i + 0.5)) * zoom + 0.5 * zoom));
  ctx.restore();
}

/** Pixel bubble: border one `gridPx` cell thick, cut corners, stepped tail, text from `pixelfont`. */
function drawPixelBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, p: Paint, tailX: number, zoom: number, dpr: number, wrap = false): void {
  const { g, t, lines, lineH, cw, chh } = pixelGeom(text, zoom, dpr, wrap);
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const X = snap(x), Y = snap(y);
  const rect = (cx: number, cy: number, w: number, h: number) => ctx.fillRect(X + cx * g, Y + cy * g, w * g, h * g);
  ctx.save();
  ctx.fillStyle = p.stroke;
  rect(1, 0, cw - 2, 1); rect(1, chh - 1, cw - 2, 1); rect(0, 1, 1, chh - 2); rect(cw - 1, 1, 1, chh - 2);
  ctx.fillStyle = p.fill;
  rect(1, 1, cw - 2, chh - 2);
  // tail: three downward steps, centered under the pet
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
  // text: font cell uses whole device pixels, starts on the border grid
  ctx.fillStyle = p.text;
  const textH = FONT_ROWS * t + (lines.length - 1) * lineH;
  const tx0 = X + 3 * g, ty0 = Y + Math.round((chh * g - textH) / 2 * dpr) / dpr;
  lines.forEach((line, li) => {
    let cx = 0;
    for (const ch of Array.from(line)) {
      const rows = glyphOf(ch);
      rows.forEach((row, ry) => {
        for (let i = 0; i < row.length; i++) if (row[i] === '#') ctx.fillRect(tx0 + (cx + i) * t, ty0 + li * lineH + ry * t, t, t);
      });
      cx += (rows[0]?.length ?? 1) + 1;
    }
  });
  ctx.restore();
}
