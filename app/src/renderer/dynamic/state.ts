// Dynamic effect state computed in the brain (spec 8.2): particles with physics and a limit, impact-frame requests,
// shake, sound words, and hand trail for streaks. `motion/fx` draws them; nothing touches the canvas here.
import type { FxEnv } from '../../motion/types';
import { PI } from '../math';
import { rng } from '../rng';
import type { Pet } from '../pet';

export type PKind = 'spark' | 'dust' | 'key' | 'page' | 'confetti' | 'bolt' | 'smoke' | 'energy' | 'note' | 'tear' | 'soul' | 'helper';
export interface Particle { k: PKind; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; s: number; col: string }
export interface Word { text: string; x: number; y: number; life: number; max: number; s: number }
export interface FxState {
  parts: Particle[]; words: Word[];
  /** impact-frame request (`PetPainter` decides: 3/s limit, `reduced`) and remaining flash frames */
  flashReq: number; flashUntil: number; flashLog: number[];
  /** hit-stop: pet stays still until this clock time (`tick` does not advance) */
  stopUntil: number;
  shakeAt: number; shakeAmp: number;
  /** hand trail [x, y, time] for streaks (`PetPainter` records it after drawing the model) */
  trail: [number, number, number][][];
  env: FxEnv; n: number; t: number;
  /** request counters (choreography tests) */
  stats: Record<string, number>;
}

export const CAP = 40;
export const WORD_TOP = -92, WORD_RISE = 12;
export const CONFETTI = ['#EF9F27', '#E24B4A', '#5DCAA5', '#85B7EB', '#7F77DD', '#F0997B'];
/** g: gravity (u/s², negative = rises), drag: resistance (1/s), life: default lifetime (s), s: size (u), col: color */
export const PHYS: Record<PKind, { g: number; drag: number; life: number; s: number; col: string }> = {
  spark: { g: 0, drag: 4, life: 0.55, s: 7, col: '#EF9F27' },
  dust: { g: -20, drag: 3, life: 0.6, s: 6, col: '#D3CFC4' },
  key: { g: 520, drag: 0.5, life: 0.9, s: 7, col: '#F1EFE8' },
  page: { g: 30, drag: 1.2, life: 1.4, s: 12, col: '#FAF9F5' },
  confetti: { g: 160, drag: 2.5, life: 1.6, s: 4, col: '#EF9F27' },
  bolt: { g: 0, drag: 0, life: 0.18, s: 26, col: '#F5D547' },
  smoke: { g: -30, drag: 2, life: 0.8, s: 9, col: '#E8E6E0' },
  energy: { g: 0, drag: 0, life: 0.5, s: 3, col: '#7F77DD' },
  note: { g: -10, drag: 0.5, life: 1.2, s: 12, col: '#D97757' },
  tear: { g: 300, drag: 0.3, life: 0.7, s: 4, col: '#85B7EB' },
  soul: { g: -8, drag: 0.2, life: 2.6, s: 8, col: '#FFFFFF' },
  helper: { g: 0, drag: 0, life: 1.6, s: 12, col: '#D97757' },
};
const FULL: FxEnv = { fx: true, bg: true, flash: true, shake: true, parts: 1 };

export function fxState(c: Pet): FxState {
  return c.fx ??= { parts: [], words: [], flashReq: 0, flashUntil: -Infinity, flashLog: [], stopUntil: -Infinity, shakeAt: -Infinity, shakeAmp: 0, trail: [[], []], env: FULL, n: 0, t: 0, stats: {} };
}

const count = (s: FxState, k: string) => { s.stats[k] = (s.stats[k] ?? 0) + 1; };

export function emit(c: Pet, k: PKind, x: number, y: number, o: Partial<Particle> = {}): void {
  const s = fxState(c), ph = PHYS[k];
  count(s, k);
  if (s.env.parts < 1 && s.n++ % 2) return;
  const cap = Math.round(CAP * s.env.parts);
  while (s.parts.length >= cap) s.parts.shift();
  s.parts.push({ k, x, y, vx: 0, vy: 0, rot: rng() * PI * 2, vr: 0, life: 0, max: ph.life, s: ph.s, col: ph.col, ...o });
}

/** `n` particles in a fan around direction `dir` (radians, 0 = right, −π/2 = up). */
export function spray(c: Pet, k: PKind, n: number, x: number, y: number, speed: number, dir = -PI / 2, spread = PI): void {
  for (let i = 0; i < n; i++) {
    const a = dir + (rng() - 0.5) * spread, v = speed * (0.6 + 0.4 * rng());
    emit(c, k, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vr: (rng() - 0.5) * 16, col: k === 'confetti' ? CONFETTI[i % CONFETTI.length] : PHYS[k].col });
  }
}

/** Impact: shake of amplitude `amp` (u) and, when `flash`, an impact-frame request. */
export function impact(c: Pet, amp: number, flash = true): void {
  const s = fxState(c);
  count(s, 'impact');
  s.shakeAt = s.t; s.shakeAmp = amp;
  if (flash) s.flashReq = 1;
}

/** Sound word; starts no higher than −92u so rising and scaling still fit in a 48 px taskbar. */
/** Hit-stop frame: whole pet (pose, action time, particles) pauses for `secs` of clock time. */
export function hitStop(c: Pet, secs: number): void {
  const s = fxState(c);
  count(s, 'stop');
  s.stopUntil = s.t + secs;
}

export function word(c: Pet, text: string, x: number, y: number, s = 30): void {
  const f = fxState(c);
  count(f, 'word:' + text);
  f.words = f.words.filter(w => w.text !== text || w.life > 0.3).slice(-2);
  f.words.push({ text, x, y: Math.max(y, WORD_TOP), life: 0, max: 1.3, s }); // words appear only at peaks: keep them visible
}

export function stepFx(c: Pet, dt: number, t: number): void {
  const s = fxState(c);
  s.t = t;
  for (const p of s.parts) {
    const ph = PHYS[p.k], dr = Math.exp(-ph.drag * dt);
    p.life += dt; p.vx *= dr; p.vy = p.vy * dr + ph.g * dt;
    if (p.k === 'page' || p.k === 'confetti') p.vx += Math.sin(p.life * 8 + p.rot) * 60 * dt;
    if (p.k === 'soul') p.x += Math.sin(p.life * 4) * 12 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  s.parts = s.parts.filter(p => p.life < p.max);
  for (const w of s.words) { w.life += dt; w.y -= WORD_RISE * dt; }
  s.words = s.words.filter(w => w.life < w.max);
}
