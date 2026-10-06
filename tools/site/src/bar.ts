// A Windows 11 taskbar drawn on a canvas (as in the README banner), with the app's own HUD on it.
import { drawBadge, drawLimits, drawProgress, limitBars } from '@app/stage/hud';
import type { Limit, Session } from '@app/types';
import { BODY, tone } from './engine';

const ICONS = ['#3A7BD5', '#D97757', '#5DCAA5', '#EF9F27'];

export interface BarOpts { icons?: number; clock?: boolean; limits?: Limit[]; z?: number; fill?: string; ink?: string }

/** The bar, with its top at `y`. Returns where the tray starts (for anything drawn left of it). */
export function drawBar(x: CanvasRenderingContext2D, X: number, y: number, W: number, H: number, o: BarOpts = {}): number {
  const z = o.z ?? 1, ink = o.ink ?? '#E9E2DA';
  x.save();
  x.fillStyle = o.fill ?? tone['stage-bar']; x.beginPath(); x.roundRect(X, y, W, H, Math.min(14, H * .32)); x.fill();
  // a thin light edge on top, like Windows draws it
  x.strokeStyle = 'rgba(255,255,255,.09)'; x.lineWidth = 1; x.beginPath(); x.roundRect(X + .5, y + .5, W - 1, H - 1, Math.min(14, H * .32)); x.stroke();
  const mid = y + H / 2, s = Math.min(26, H * .56);
  for (let i = 0; i < (o.icons ?? 4); i++) {
    x.fillStyle = ICONS[i % ICONS.length]; x.beginPath(); x.roundRect(X + H * .45 + i * (s + s * .7), mid - s / 2, s, s, s * .27); x.fill();
  }
  let tray = X + W;
  if (o.clock !== false) {
    x.fillStyle = ink; x.font = `700 ${Math.round(13 * Math.min(1.2, z))}px ${BODY}`; x.textAlign = 'right'; x.textBaseline = 'middle';
    x.fillText('12:00', X + W - H * .4, mid + 1);
    tray -= H * .4 + 46 * Math.min(1.2, z);
  }
  if (o.limits) {
    const bars = limitBars(o.limits), bw = (bars.length * 5 + 6) * z;
    tray -= bw + 8;
    x.save(); x.translate(tray, y + (H - 48 * z) / 2); x.scale(z, z); drawLimits(x, 0, 48, bars); x.restore();
  }
  x.restore();
  return tray;
}

export function progress(x: CanvasRenderingContext2D, cx: number, y: number, z: number, s: Pick<Session, 'agent' | 'state' | 'progress'>, T: number, music: 'dance' | 'doze' | null = null): void {
  x.save(); x.translate(cx, y); x.scale(z, z); drawProgress(x, 0, 0, s as Session, T, music); x.restore();
}

export function badge(x: CanvasRenderingContext2D, bx: number, y: number, z: number, n: number): void {
  x.save(); x.translate(bx, y); x.scale(z, z); drawBadge(x, 0, 48, n, BODY); x.restore();
}

/** Limit readings that drift slowly, so the bars look alive. */
export function limitsAt(T: number): Limit[] {
  const w = (base: number, k: number) => Math.max(2, Math.min(97, base + 6 * Math.sin(T * .21 * k + k)));
  return [
    { agent: 'claude', window: 'five_hour', used_pct: w(46, 1), resets_at: null },
    { agent: 'claude', window: 'weekly', used_pct: w(22, .4), resets_at: null },
    { agent: 'codex', window: 'five_hour', used_pct: w(64, .8), resets_at: null },
    { agent: 'codex', window: 'weekly', used_pct: w(30, .3), resets_at: null },
    { agent: 'antigravity', window: 'five_hour', used_pct: w(18, 1.3), resets_at: null },
    { agent: 'antigravity', window: 'weekly', used_pct: w(9, .5), resets_at: null },
  ];
}
