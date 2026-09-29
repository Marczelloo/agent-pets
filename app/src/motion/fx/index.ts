// Compose a Dynamic frame (spec 8.1–8.2): rate-limited impact frame, shake, body stretch, hand trail,
// and separate effect drawing for vector and pixel models.
import type { FxState } from '../../renderer/dynamic/state';
import { cl } from '../../renderer/math';
import type { Pet } from '../../renderer/pet';
import type { FxEnv } from '../types';
import { pixelBack, pixelFront } from './pixel';
import { vectorBack, vectorFront } from './vector';

export interface FxCtx { X: number; Y: number; u: number; t: number; dpr: number; env: FxEnv; model: 'vector' | 'sticker' | 'pixel'; flash: boolean;
  /** intensity of the fading white flash after an impact frame (1 → 0) */
  glow: number; accent: string; alpha: number }

export const FLASH_MAX = 3;
export const TRAIL_S = 0.12;
/** An impact frame lasts this long in time (not frames) so it remains visible in the taskbar at 10 fps. */
export const FLASH_S = 0.12;
/** After an inverted frame, the white background with rays fades over this many seconds (flash does not vanish immediately). */
export const FLASH_FADE = 0.4;

/**
 * Whether this is an impact frame: FLASH_S (0.12 s) per impact, at most 3 impacts per second (`now` = stage clock).
 * Requests during a flash or within 1/3 s of the last one are dropped (flashes do not merge into one long flash).
 */
export function flashFrame(s: FxState, now: number, env: FxEnv): boolean {
  if (s.flashReq) {
    s.flashReq = 0;
    s.flashLog = s.flashLog.filter(v => now - v < 1 && v <= now);
    const last = s.flashLog.at(-1) ?? -Infinity;
    if (env.flash && !(now < s.flashUntil) && s.flashLog.length < FLASH_MAX && now - last >= 1 / FLASH_MAX - 1e-9) { s.flashLog.push(now); s.flashUntil = now + FLASH_S; }
  }
  return env.flash && now >= (s.flashLog.at(-1) ?? Infinity) && now < s.flashUntil;
}

/** White flash intensity: 1 during the impact frame, then linearly to 0 over FLASH_FADE. */
export function flashGlow(s: FxState, now: number, env: FxEnv): number {
  const start = s.flashLog.at(-1);
  if (!env.flash || start == null || now < start) return 0;
  if (now < s.flashUntil) return 1;
  return cl(1 - (now - s.flashUntil) / FLASH_FADE);
}

/** Shake offset in px; `cell` > 0 rounds to a pixel-grid cell. */
export function shakeOffset(s: FxState, t: number, env: FxEnv, u: number, cell: number): [number, number] {
  const e = t - s.shakeAt;
  if (!env.shake || !(e >= 0 && e < 0.3)) return [0, 0];
  let a = s.shakeAmp * u * Math.exp(-e * 14);
  if (cell > 0 && e < 0.15) a = Math.max(a, cell); // at least one cell in the pixel taskbar, otherwise it rounds to zero
  const dx = a * Math.sin(e * 90), dy = a * 0.5 * Math.cos(e * 70);
  return cell > 0 ? [Math.round(dx / cell) * cell, Math.round(dy / cell) * cell] : [dx, dy];
}

/** Body stretch in the direction of fast horizontal motion (a trail instead of ghosting). */
export const stretchOf = (c: Pet) => cl((Math.abs(c.p.lx.v) - 150) / 1500, 0, 0.3);

export function recordTrail(s: FxState, c: Pet, now: number): void {
  const hands: number[][] = c.hand ?? [];
  hands.forEach((h, i) => {
    const tr = (s.trail[i] ??= []);
    tr.push([h[0], h[1], now]);
    while (tr.length && (now - tr[0][2] > TRAIL_S || tr[0][2] > now)) tr.shift();
    if (tr.length > 8) tr.splice(0, tr.length - 8);
  });
}

export function drawFxBack(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void { if (g.env.fx) (g.model === 'pixel' ? pixelBack : vectorBack)(x, c, g); }
export function drawFxFront(x: CanvasRenderingContext2D, c: Pet, g: FxCtx): void { if (g.env.fx) (g.model === 'pixel' ? pixelFront : vectorFront)(x, c, g); }
