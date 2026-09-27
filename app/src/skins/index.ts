import { clawd } from './clawd';
import { kodek } from './kodek';
import { opencode } from './opencode';
import { blob } from './blob';
import { copilot } from './copilot';
import { antigravity } from './antigravity';
import type { Skin, SkinId } from './types';
export type { Skin, SkinId } from './types';
export const SKINS: Record<SkinId, Skin> = { clawd, kodek, opencode, blob, copilot, antigravity };

const hex = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l), f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
};

/** Barwa bloba z nazwy agenta (FNV-1a → odcień 0–359); jasność i nasycenie stałe, żeby każdy blob był równie czytelny. */
export function blobPal(name: string): Skin['pal'] {
  let x = 0x811c9dc5;
  for (const ch of name) { x ^= ch.codePointAt(0) ?? 0; x = Math.imul(x, 0x01000193) >>> 0; }
  const h = x % 360;
  return { m: hex(h, .52, .62), s: hex(h, .45, .47), b: hex(h, .48, .55), h: hex(h, .6, .82), g: '#a8a49a', gs: '#86837a' };
}
