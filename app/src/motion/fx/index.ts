// Składanie klatki Dynamiczny (spec 8.1–8.2): klatka uderzenia z limitem, wstrząs, rozciągnięcie ciała, ślad dłoni,
// rozdział rysowania efektów na model wektorowy i pikselowy.
import type { FxState } from '../../renderer/dynamic/state';
import { cl } from '../../renderer/math';
import type { Pet } from '../../renderer/pet';
import type { FxEnv } from '../types';
import { pixelBack, pixelFront } from './pixel';
import { vectorBack, vectorFront } from './vector';

export interface FxCtx { X: number; Y: number; u: number; t: number; dpr: number; env: FxEnv; model: 'vector' | 'sticker' | 'pixel'; flash: boolean; accent: string; alpha: number }

export const FLASH_MAX = 3;
export const TRAIL_S = 0.12;

/**
 * Czy ta klatka jest klatką uderzenia: 2 klatki na uderzenie, najwyżej 3 uderzenia w ciągu sekundy (czas `now` = zegar sceny).
 * Prośby w trakcie błysku i bliżej niż 1/3 s od poprzedniego przepadają (błyski nie zlewają się w jeden długi).
 */
export function flashFrame(s: FxState, now: number, env: FxEnv): boolean {
  if (s.flashReq) {
    s.flashReq = 0;
    s.flashLog = s.flashLog.filter(v => now - v < 1 && v <= now);
    const last = s.flashLog.at(-1) ?? -Infinity;
    if (env.flash && s.flashFrames === 0 && s.flashLog.length < FLASH_MAX && now - last >= 1 / FLASH_MAX - 1e-9) { s.flashLog.push(now); s.flashFrames = 2; }
  }
  if (s.flashFrames > 0 && env.flash) { s.flashFrames--; return true; }
  s.flashFrames = 0;
  return false;
}

/** Przesunięcie wstrząsu w px; `cell` > 0 zaokrągla do komórki siatki pikselowej. */
export function shakeOffset(s: FxState, t: number, env: FxEnv, u: number, cell: number): [number, number] {
  const e = t - s.shakeAt;
  if (!env.shake || !(e >= 0 && e < 0.3)) return [0, 0];
  const a = s.shakeAmp * u * Math.exp(-e * 14), dx = a * Math.sin(e * 90), dy = a * 0.5 * Math.cos(e * 70);
  return cell > 0 ? [Math.round(dx / cell) * cell, Math.round(dy / cell) * cell] : [dx, dy];
}

/** Rozciągnięcie ciała w kierunku szybkiego ruchu poziomego (smuga zamiast duchów). */
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
