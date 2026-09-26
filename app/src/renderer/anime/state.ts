// Stan efektów Anime liczony w mózgu (spec 8.2): cząsteczki z własną fizyką i limitem, prośby o klatkę uderzenia,
// wstrząs, onomatopeje, ślad dłoni do smug. Rysuje `motion/fx`; tu nic nie dotyka płótna.
import type { FxEnv } from '../../motion/types';
import { PI } from '../math';
import { rng } from '../rng';
import type { Pet } from '../pet';

export type PKind = 'spark' | 'dust' | 'key' | 'page' | 'confetti' | 'bolt' | 'smoke' | 'energy' | 'note' | 'tear' | 'soul' | 'helper';
export interface Particle { k: PKind; x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; s: number; col: string }
export interface Word { text: string; x: number; y: number; life: number; max: number; s: number }
export interface FxState {
  parts: Particle[]; words: Word[];
  /** prośba o klatkę uderzenia (decyduje `PetPainter`: limit 3/s, `reduced`) i pozostałe klatki błysku */
  flashReq: number; flashFrames: number; flashLog: number[];
  shakeAt: number; shakeAmp: number;
  /** ślad dłoni [x, y, czas] do smug (zapisuje `PetPainter` po narysowaniu modelu) */
  trail: [number, number, number][][];
  env: FxEnv; n: number; t: number;
  /** liczniki próśb (testy choreografii) */
  stats: Record<string, number>;
}

export const CAP = 40;
export const CONFETTI = ['#EF9F27', '#E24B4A', '#5DCAA5', '#85B7EB', '#7F77DD', '#F0997B'];
/** g: grawitacja (u/s², ujemna = unosi się), drag: opór (1/s), life: domyślny czas życia (s), s: rozmiar (u), col: kolor */
export const PHYS: Record<PKind, { g: number; drag: number; life: number; s: number; col: string }> = {
  spark: { g: 0, drag: 5, life: 0.35, s: 7, col: '#EF9F27' },
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
  return c.fx ??= { parts: [], words: [], flashReq: 0, flashFrames: 0, flashLog: [], shakeAt: -Infinity, shakeAmp: 0, trail: [[], []], env: FULL, n: 0, t: 0, stats: {} };
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

/** `n` cząsteczek wachlarzem wokół kierunku `dir` (radiany, 0 = w prawo, −π/2 = w górę). */
export function spray(c: Pet, k: PKind, n: number, x: number, y: number, speed: number, dir = -PI / 2, spread = PI): void {
  for (let i = 0; i < n; i++) {
    const a = dir + (rng() - 0.5) * spread, v = speed * (0.6 + 0.4 * rng());
    emit(c, k, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, vr: (rng() - 0.5) * 16, col: k === 'confetti' ? CONFETTI[i % CONFETTI.length] : PHYS[k].col });
  }
}

/** Uderzenie: wstrząs o amplitudzie `amp` (u) i — gdy `flash` — prośba o klatkę uderzenia. */
export function impact(c: Pet, amp: number, flash = true): void {
  const s = fxState(c);
  count(s, 'impact');
  s.shakeAt = s.t; s.shakeAmp = amp;
  if (flash) s.flashReq = 1;
}

export function word(c: Pet, text: string, x: number, y: number, s = 30): void {
  const f = fxState(c);
  count(f, 'word:' + text);
  f.words = f.words.filter(w => w.text !== text || w.life > 0.3).slice(-2);
  f.words.push({ text, x, y, life: 0, max: 0.9, s });
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
  for (const w of s.words) { w.life += dt; w.y -= 18 * dt; }
  s.words = s.words.filter(w => w.life < w.max);
}
