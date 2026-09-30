// Screen-space and effect overlays: kinetic captions, name tags, speech bubbles, glass ripples, confetti, paper planes.
import { ACCENT } from '@app/styles';
import { morph } from '@app/renderer/fold';
import type { Format } from './format';
import { clamp, easeOut, easeOutBack, hash, remap, TAU } from './util';
import { FONT, PAL, UI_FONT } from './world';

/* ---------- kinetic captions ---------- */

/** Default caption ink: the story sets it from the current theme every frame (light on the dark desktop, dark on Ink). */
let INK = PAL.ink;
export const setInk = (c: string): void => { INK = c; };

export interface Tok {
  text: string;
  /** appear time (global seconds); the word keeps its place in the line before that so nothing shifts */
  t: number;
  /** disappear time; omit to stay */
  out?: number;
  color?: string;
  /** relative size */
  k?: number;
}

export interface CaptionOpts {
  /** font px for k = 1 */
  size: number;
  /** centre of the block, px */
  cx: number; cy: number;
  lineGap?: number;
  weight?: number;
  align?: 'center' | 'left';
  font?: string;
  /** slight tilt of the whole block, rad */
  tilt?: number;
}

const popScale = (age: number) => (age < 0 ? 0 : age > 0.4 ? 1 : easeOutBack(age / 0.4, 1.5));

/** Lines of words; each word pops in with a little overshoot and leaves with a quick shrink. */
export function drawCaption(x: CanvasRenderingContext2D, T: number, lines: Tok[][], o: CaptionOpts): void {
  const font = o.font ?? FONT, weight = o.weight ?? 700, gap = o.lineGap ?? 1.12;
  x.save();
  x.textBaseline = 'alphabetic'; x.lineJoin = 'round';
  // measure
  const metrics = lines.map(line => line.map(tk => { x.font = `${weight} ${o.size * (tk.k ?? 1)}px ${font}`; return x.measureText(tk.text).width; }));
  const space = o.size * 0.3;
  const widths = metrics.map(ms => ms.reduce((a, b) => a + b, 0) + space * Math.max(0, ms.length - 1));
  const lh = o.size * gap, top = o.cy - (lh * (lines.length - 1)) / 2;
  if (o.tilt) { x.translate(o.cx, o.cy); x.rotate(o.tilt); x.translate(-o.cx, -o.cy); }
  lines.forEach((line, li) => {
    let px = o.align === 'left' ? o.cx : o.cx - widths[li] / 2;
    const py = top + li * lh;
    line.forEach((tk, ti) => {
      const w = metrics[li][ti], age = tk.t <= 0 ? 9 : T - tk.t, out = tk.out != null ? clamp((T - tk.out) / 0.22) : 0;
      const sc = popScale(age) * (1 - 0.25 * easeOut(out)), a = (1 - easeOut(out)) * clamp(age / 0.08);
      if (sc > 0.01 && a > 0.01) {
        const size = o.size * (tk.k ?? 1);
        x.save();
        x.globalAlpha = a;
        x.translate(px + w / 2, py + size * 0.32);
        x.rotate((1 - clamp(age / 0.42)) * (hash(ti * 3 + li * 7) - 0.5) * 0.22);
        x.scale(sc, sc);
        x.font = `${weight} ${size}px ${font}`; x.textAlign = 'center';
        x.fillStyle = tk.color ?? INK;
        x.fillText(tk.text, 0, size * 0.36 - size * 0.0);
        x.restore();
      }
      px += w + space;
    });
  });
  x.restore();
}

/* ---------- name tags ---------- */

export interface TagOpts {
  name: string;
  sub?: string;
  color: string;
  /** appear / disappear (global seconds) */
  t: number; out?: number;
  /** px height of the pill */
  h: number;
  /** tilt in rad */
  tilt?: number;
  /** which point of the pill sits on (sx, sy): its centre, left edge or right edge */
  anchor?: 'c' | 'l' | 'r';
}

/** A sticker-style label: white pill, dark outline, agent colour dot, popping in with overshoot. */
export function drawTag(x: CanvasRenderingContext2D, T: number, sx: number, sy: number, o: TagOpts): void {
  const age = T - o.t, out = o.out != null ? clamp((T - o.out) / 0.2) : 0;
  const sc = popScale(age) * (1 - 0.3 * easeOut(out));
  if (sc < 0.01 || out >= 1) return;
  const h = o.h, r = h / 2, f1 = h * 0.5, f2 = h * 0.34;
  x.save();
  x.font = `700 ${f1}px ${FONT}`; const w1 = x.measureText(o.name).width;
  x.font = `700 ${f2}px ${UI_FONT}`; const w2 = o.sub ? x.measureText(o.sub).width : 0;
  const dot = h * 0.3, pad = h * 0.42, w = pad + dot + h * 0.24 + Math.max(w1, w2) + pad, hh = o.sub ? h * 1.18 : h;
  x.translate(sx, sy); x.rotate(o.tilt ?? 0); x.scale(sc, sc); x.translate(o.anchor === 'l' ? w / 2 : o.anchor === 'r' ? -w / 2 : 0, 0); x.globalAlpha = (1 - easeOut(out)) * clamp(age / 0.06);
  x.shadowColor = 'rgba(43,38,34,0.22)'; x.shadowBlur = h * 0.3; x.shadowOffsetY = h * 0.12;
  x.fillStyle = '#FFFDF7'; x.strokeStyle = PAL.ink; x.lineWidth = Math.max(3, h * 0.07); x.lineJoin = 'round';
  x.beginPath(); x.roundRect(-w / 2, -hh / 2, w, hh, r); x.fill();
  x.shadowColor = 'transparent'; x.stroke();
  x.fillStyle = o.color; x.strokeStyle = PAL.ink; x.lineWidth = Math.max(2, h * 0.05);
  x.beginPath(); x.arc(-w / 2 + pad + dot / 2, o.sub ? -hh * 0.14 : 0, dot / 2, 0, TAU); x.fill(); x.stroke();
  x.fillStyle = PAL.ink; x.textAlign = 'left'; x.textBaseline = 'middle';
  x.font = `700 ${f1}px ${FONT}`; x.fillText(o.name, -w / 2 + pad + dot + h * 0.24, o.sub ? -hh * 0.14 : h * 0.02);
  if (o.sub) { x.fillStyle = '#7A6E64'; x.font = `700 ${f2}px ${UI_FONT}`; x.fillText(o.sub, -w / 2 + pad + dot + h * 0.24, hh * 0.24); }
  x.restore();
}

export const accentOf = (skin: string): string => (ACCENT as Record<string, string>)[skin] ?? '#8C887E';

/* ---------- speech bubble (same look as the app's question bubble, but with a tail that can point any way) ---------- */

export interface BubbleOpts {
  /** one string, or several lines */
  text: string | string[];
  /** anchor: where the tail tip touches, px */
  ax: number; ay: number;
  /** which side of the bubble the tail sits on */
  side: 'below' | 'left' | 'right';
  /** font px */
  size: number;
  /** pop progress: seconds since appearing (negative = hidden) */
  age: number;
  /** seconds since it started to leave (undefined = staying) */
  gone?: number;
  kind?: 'question' | 'action';
}

export function drawBubble(x: CanvasRenderingContext2D, o: BubbleOpts): void {
  const sc = o.gone != null ? Math.max(0, 1 - easeOut(clamp(o.gone / 0.18))) * (1 + 0.12 * Math.sin(clamp(o.gone / 0.18) * Math.PI)) : popScale(o.age);
  if (sc < 0.01) return;
  const q = (o.kind ?? 'question') === 'question', s = o.size;
  x.save();
  x.font = `700 ${s}px ${UI_FONT}`;
  const lines = Array.isArray(o.text) ? o.text : [o.text], lh = s * 1.22;
  const tw = Math.max(...lines.map(l => x.measureText(l).width)), pw = s * 0.85, ph = s * 0.62, w = tw + 2 * pw, h = s + (lines.length - 1) * lh + 2 * ph, r = s * 0.9, tail = s * 0.62;
  const bx = o.side === 'below' ? -w * 0.2 : o.side === 'left' ? tail : -w - tail, by = o.side === 'below' ? -h - tail : -h / 2;
  x.translate(o.ax, o.ay); x.scale(sc, sc);
  x.shadowColor = 'rgba(43,38,34,0.20)'; x.shadowBlur = s * 0.6; x.shadowOffsetY = s * 0.22;
  x.fillStyle = q ? '#FFF4E2' : '#FFFFFF'; x.strokeStyle = q ? '#C97A1A' : '#5C5650'; x.lineWidth = Math.max(2.5, s * 0.11); x.lineJoin = 'round';
  x.beginPath(); x.roundRect(bx, by, w, h, r);
  const tw2 = s * 0.36;
  if (o.side === 'below') { x.moveTo(-tw2 * 1.1, by + h - 1); x.lineTo(0, 0); x.lineTo(tw2 * 0.9, by + h - 1); }
  else if (o.side === 'left') { x.moveTo(bx + 1, by + h / 2 - tw2); x.lineTo(0, 0); x.lineTo(bx + 1, by + h / 2 + tw2); }
  else { x.moveTo(bx + w - 1, by + h / 2 - tw2); x.lineTo(0, 0); x.lineTo(bx + w - 1, by + h / 2 + tw2); }
  x.fill();
  x.shadowColor = 'transparent';
  x.stroke();
  // cover the seam where the tail joins the body
  x.fillStyle = q ? '#FFF4E2' : '#FFFFFF';
  x.beginPath();
  if (o.side === 'below') x.rect(-tw2 * 1.1 + x.lineWidth / 2, by + h - x.lineWidth, tw2 * 2 - x.lineWidth, x.lineWidth * 1.6);
  else if (o.side === 'left') x.rect(bx + x.lineWidth * 0.2, by + h / 2 - tw2 + x.lineWidth / 2, x.lineWidth * 1.6, tw2 * 2 - x.lineWidth);
  else x.rect(bx + w - x.lineWidth * 1.8, by + h / 2 - tw2 + x.lineWidth / 2, x.lineWidth * 1.6, tw2 * 2 - x.lineWidth);
  x.fill();
  x.fillStyle = '#33302B'; x.textAlign = 'center'; x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, bx + w / 2, by + ph + s / 2 + i * lh + s * 0.04));
  x.restore();
}

/* ---------- comic word ("puk", "BAM!") ---------- */

export function drawWord(x: CanvasRenderingContext2D, T: number, t0: number, sx: number, sy: number, text: string, size: number, color = PAL.clay, life = 0.7, rot = -0.1): void {
  const age = T - t0;
  if (age < 0 || age > life) return;
  const pop = age < 0.08 ? 0.6 + age / 0.08 * 0.7 : age < 0.2 ? 1.3 - (age - 0.08) / 0.12 * 0.3 : 1, fade = age > life * 0.6 ? 1 - (age - life * 0.6) / (life * 0.4) : 1;
  x.save(); x.translate(sx, sy - age * size * 0.35); x.rotate(rot); x.scale(pop, pop); x.globalAlpha = fade;
  x.font = `700 ${size}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
  x.lineWidth = size * 0.2; x.strokeStyle = '#FFFDF7'; x.strokeText(text, 0, 0);
  x.fillStyle = color; x.fillText(text, 0, 0);
  x.restore();
}

/* ---------- glass ripples: what a knock looks like from behind the screen ---------- */

export function drawRipple(x: CanvasRenderingContext2D, T: number, t0: number, sx: number, sy: number, size: number, life = 0.75): void {
  const age = T - t0;
  if (age < 0 || age > life) return;
  const k = age / life;
  x.save();
  for (let i = 0; i < 3; i++) {
    const kk = clamp(k * 1.25 - i * 0.16);
    if (kk <= 0) continue;
    x.globalAlpha = (1 - kk) * (i === 0 ? 1 : 0.85);
    x.lineWidth = size * (0.06 - i * 0.014) * (1 - kk * 0.5) + 2;
    x.strokeStyle = i === 0 ? '#FFFFFF' : '#E8B08D';
    x.beginPath(); x.arc(sx, sy, size * (0.14 + easeOut(kk) * 1.0 + i * 0.04), 0, TAU); x.stroke();
  }
  x.restore();
}

/* ---------- confetti: a pure function of time, so it needs no state ---------- */

const CONFETTI = ['#D97757', '#5DCAA5', '#EF9F27', '#E9E2DA', '#D97757', '#9AA6C4'];

export interface Burst { t: number; x: number; y: number; n: number; speed: number; up?: number; spread?: number; seed?: number; life?: number; size?: number; dir?: number; gravity?: number }

export function drawBurst(x: CanvasRenderingContext2D, T: number, b: Burst, fmt: Format): void {
  const age = T - b.t, life = b.life ?? 2.6;
  if (age < 0 || age > life) return;
  const s = b.seed ?? 1, size = b.size ?? 1;
  x.save();
  for (let i = 0; i < b.n; i++) {
    const a = (b.dir ?? -Math.PI / 2) + (hash(i * 1.7 + s) - 0.5) * (b.spread ?? Math.PI * 1.1), v = b.speed * (0.45 + 0.75 * hash(i * 3.1 + s * 2)), g = b.gravity ?? b.speed * 1.9, drag = 1.6;
    const tt = (1 - Math.exp(-drag * age)) / drag;
    const px = b.x + Math.cos(a) * v * tt + Math.sin(age * 5 + i) * 10 * size, py = b.y + Math.sin(a) * v * tt + 0.5 * g * age * age * 0.55 - (b.up ?? 0) * tt;
    if (px < -40 || px > fmt.W + 40 || py > fmt.H + 60) continue;
    const fade = age > life - 0.5 ? (life - age) / 0.5 : 1;
    x.globalAlpha = fade; x.fillStyle = CONFETTI[i % CONFETTI.length];
    x.save(); x.translate(px, py); x.rotate(hash(i + s) * TAU + age * (4 + hash(i * 9) * 8)); x.scale(1, Math.cos(age * 6 + i));
    const w = (9 + hash(i * 5) * 8) * size, h = w * 0.55;
    if (i % 5 === 0) { x.beginPath(); x.arc(0, 0, w * 0.4, 0, TAU); x.fill(); } else x.fillRect(-w / 2, -h / 2, w, h);
    x.restore();
  }
  x.restore();
}

/* ---------- paper plane (the same folded shape the app throws for subagents) ---------- */

export function drawPlane(x: CanvasRenderingContext2D, sx: number, sy: number, rot: number, size: number): void {
  x.save(); x.translate(sx, sy); x.rotate(rot);
  const p = morph(1, size / 30);
  x.beginPath(); p.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath();
  x.fillStyle = '#FAF9F5'; x.fill(); x.lineWidth = Math.max(2, size * 0.09); x.strokeStyle = '#2B1D16'; x.lineJoin = 'round'; x.stroke();
  x.restore();
}

/** Four-point sparkle. */
export function drawSpark(x: CanvasRenderingContext2D, sx: number, sy: number, r: number, color: string, rot = 0): void {
  x.save(); x.translate(sx, sy); x.rotate(rot); x.fillStyle = color; x.beginPath();
  x.moveTo(0, -r); x.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0); x.quadraticCurveTo(r * 0.16, r * 0.16, 0, r); x.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0); x.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r);
  x.fill(); x.restore();
}

export const clampRemap = remap;

/* ---------- the net's bag drawn over the cursor, so it really is inside ---------- */

import type { Actor } from './actors';

/** Redraws the translucent mesh of a pet's net in front of whatever is inside it (geometry as in the app's items.ts). */
export function drawNetOverlay(x: CanvasRenderingContext2D, a: Actor, alpha = 0.7): void {
  const pet = a.pet, hoop = pet.hoop as [number, number] | undefined, hand = pet.hand?.[1] as [number, number] | undefined, ph: number = pet.p.pole.x;
  if (!hoop || !hand || a.spec.hidden) return;
  const P = (lx: number, ly: number) => a.pt(lx, ly);
  const d = [Math.sin(ph), -Math.cos(ph)], pn = [Math.cos(ph), Math.sin(ph)], RA = 15, RB = 8;
  const rim = (t: number): [number, number] => [hoop[0] + d[0] * RA * Math.cos(t) + pn[0] * RB * Math.sin(t), hoop[1] + d[1] * RA * Math.cos(t) + pn[1] * RB * Math.sin(t)];
  const A = rim(Math.PI), B = rim(0), tip: [number, number] = [hoop[0] + pn[0] * 30 - d[0] * 3, hoop[1] + pn[1] * 30 - d[1] * 3];
  const pts: [number, number][] = [A];
  for (let i = 1; i <= 12; i++) pts.push(rim(Math.PI + (Math.PI * i) / 12));
  const bag = () => {
    x.beginPath();
    pts.forEach(([px, py], i) => { const [sx, sy] = P(px, py); if (i) x.lineTo(sx, sy); else x.moveTo(sx, sy); });
    const [q1x, q1y] = P(B[0] + pn[0] * 22, B[1] + pn[1] * 22), [tx, ty] = P(tip[0], tip[1]), [q2x, q2y] = P(A[0] + pn[0] * 24, A[1] + pn[1] * 24), [ax, ay] = P(A[0], A[1]);
    x.quadraticCurveTo(q1x, q1y, tx, ty); x.quadraticCurveTo(q2x, q2y, ax, ay); x.closePath();
  };
  x.save();
  bag(); x.globalAlpha = alpha * 0.55; x.fillStyle = 'rgba(250,249,245,1)'; x.fill();
  x.globalAlpha = alpha; x.save(); bag(); x.clip(); x.strokeStyle = 'rgba(95,94,90,0.55)'; x.lineWidth = Math.max(1.2, a.u * 0.32); x.beginPath();
  const [hx, hy] = P(hoop[0], hoop[1]), [ex, ey] = P(hoop[0] + d[0], hoop[1] + d[1]), [fx, fy] = P(hoop[0] + pn[0], hoop[1] + pn[1]);
  const D = [ex - hx, ey - hy], N = [fx - hx, fy - hy], k = 4.5;
  for (let i = -8; i <= 8; i++) {
    const o = i * k;
    x.moveTo(hx + N[0] * o - D[0] * 40, hy + N[1] * o - D[1] * 40); x.lineTo(hx + N[0] * (o + 50) + D[0] * 40, hy + N[1] * (o + 50) + D[1] * 40);
    x.moveTo(hx + N[0] * o + D[0] * 40, hy + N[1] * o + D[1] * 40); x.lineTo(hx + N[0] * (o + 50) - D[0] * 40, hy + N[1] * (o + 50) - D[1] * 40);
  }
  x.stroke(); x.restore();
  bag(); x.lineWidth = Math.max(1.5, a.u * 0.5); x.strokeStyle = '#2B1D16'; x.lineJoin = 'round'; x.stroke();
  x.restore();
}

/** Little stars circling a dizzy head. */
export function drawDizzy(x: CanvasRenderingContext2D, T: number, sx: number, sy: number, r: number): void {
  for (let i = 0; i < 3; i++) {
    const a = T * 9 + (i * TAU) / 3;
    drawSpark(x, sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.32, r * 0.28, '#EF9F27', a);
  }
}

/* ---------- swipe transition: a slanted band sweeps across, the cut happens at its middle ---------- */

export function drawSwipe(x: CanvasRenderingContext2D, fmt: Format, T: number, cut: number, len: number, fill: string, edge: string): void {
  const p = (T - (cut - len / 2)) / len;
  if (p < 0 || p > 1) return;
  const W = fmt.W, H = fmt.H, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const cx = W / 2 + (e - 0.5) * 2.9 * W, hw = 0.85 * W, sk = 0.16 * H;
  const band = (o: number, col: string) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx - hw + o + sk, 0); x.lineTo(cx + hw + o + sk, 0); x.lineTo(cx + hw + o - sk, H); x.lineTo(cx - hw + o - sk, H); x.closePath(); x.fill(); };
  x.save(); band(0.05 * W, edge); band(0, fill); x.restore();
}
