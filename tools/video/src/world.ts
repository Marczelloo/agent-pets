// The stage the pets stand on: cream desktop backdrop, ghost windows, the dark taskbar with tray, and the mouse cursor.
// Everything is drawn in world pu through the camera, so it scales with the pets.
import type { Cam } from './camera';
import { worldToScreen } from './camera';
import type { Format } from './format';
import { drawLimits, drawProgress, limitBars } from '@app/stage/hud';
import type { Limit, Session } from '@app/types';
import { CREAM, type Theme } from './themes';
import { TAU } from './util';

export const PAL = {
  cream: '#FBF1E8', glow: '#F7DDC9', ink: '#2B2622', bar: '#1F1C1A', barEdge: '#2F2A27', clay: '#D97757', teal: '#1D9E75',
  amber: '#EF9F27', win: '#FFF9F3', winEdge: '#EED9C8', winBar: '#F6E6D8', winLine: '#F1E0D0', winLine2: '#EAD3BF',
};
export const FONT = '"Fredoka Variable", "Segoe UI", sans-serif';
export const UI_FONT = '"Segoe UI", system-ui, sans-serif';

/** Where things sit in the world. The taskbar top is y = 0, pets stand on it; negative y is up. */
export const WORLD = {
  barX0: -520, barX1: 1000, barH: 64,
  /** the document window the user is reading: right above the crew, which is the joke */
  win: { x: -120, y: -560, w: 460, h: 350 },
  win2: { x: 380, y: -500, w: 280, h: 230 },
  win3: { x: -500, y: -470, w: 270, h: 260 },
  trayX: 470,
  limitsX: 376,
};

const rr = (x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, R: number) => { x.beginPath(); x.roundRect(X, Y, W, H, R); };

export interface Wipe { prev: Theme; k: number; cx: number; cy: number }

function paintTheme(x: CanvasRenderingContext2D, fmt: Format, cam: Cam, T: number, th: Theme, windows = 1): void {
  x.fillStyle = th.bg; x.fillRect(0, 0, fmt.W, fmt.H);
  // one warm glow behind the action, anchored in the world so it slides with the camera
  const [gx, gy] = worldToScreen(cam, fmt, 95, -170), gr = 640 * cam.z;
  const g = x.createRadialGradient(gx, gy, gr * 0.05, gx, gy, gr);
  g.addColorStop(0, th.glow); g.addColorStop(1, th.bg + '00');
  x.fillStyle = g; x.fillRect(0, 0, fmt.W, fmt.H);
  if (windows > 0.01) { x.save(); x.globalAlpha = windows; drawWindows(x, fmt, cam, T, th); x.restore(); }
}

/** Backdrop in the current theme; a `wipe` paints the previous theme first and grows the new one out of a circle. */
export function drawBackdrop(x: CanvasRenderingContext2D, fmt: Format, cam: Cam, T: number, th: Theme = CREAM, wipe?: Wipe, windows = 1): void {
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (wipe && wipe.k < 1) {
    paintTheme(x, fmt, cam, T, wipe.prev, windows);
    x.save(); x.beginPath(); x.arc(wipe.cx, wipe.cy, Math.hypot(fmt.W, fmt.H) * (1 - Math.pow(1 - wipe.k, 3)), 0, TAU); x.clip();
    paintTheme(x, fmt, cam, T, th, windows);
    x.restore();
  } else paintTheme(x, fmt, cam, T, th, windows);
}

/** A paragraph of soft bars inside a window, scrolling upward while the user reads. */
function textLines(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, z: number, T: number, seed: number, th: Theme, pitch = 17) {
  x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
  const cyc = pitch * 6 * z, off = (T * 9 * z) % cyc;
  for (let i = -1; i < H / (pitch * z) + 7; i++) {
    const n = (i % 6 + 6) % 6, wv = n === 5 ? 0.42 : 0.9 - ((n * 37 + seed * 11) % 5) * 0.09;
    const yy = Y + 14 * z + i * pitch * z - off;
    x.fillStyle = n === 0 ? th.winLine2 : th.winLine;
    rr(x, X + 16 * z, yy, (W - 32 * z) * wv, 7 * z, 3.5 * z); x.fill();
  }
  x.restore();
}

function ghostWindow(x: CanvasRenderingContext2D, fmt: Format, cam: Cam, T: number, w: { x: number; y: number; w: number; h: number }, seed: number, th: Theme) {
  const [sx, sy] = worldToScreen(cam, fmt, w.x, w.y), z = cam.z, W = w.w * z, H = w.h * z;
  if (sx > fmt.W + 50 || sy > fmt.H + 50 || sx + W < -50 || sy + H < -50) return;
  x.save();
  x.shadowColor = th.bg === '#14111C' ? 'rgba(0,0,0,0.35)' : 'rgba(217,150,110,0.18)'; x.shadowBlur = 30 * z; x.shadowOffsetY = 10 * z;
  x.fillStyle = th.win; rr(x, sx, sy, W, H, 16 * z); x.fill();
  x.restore();
  x.strokeStyle = th.winEdge; x.lineWidth = Math.max(1, 2 * z); rr(x, sx, sy, W, H, 16 * z); x.stroke();
  x.fillStyle = th.winBar; x.beginPath(); x.roundRect(sx, sy, W, 30 * z, [16 * z, 16 * z, 0, 0]); x.fill();
  ['#F2B8A0', '#F4D089', '#B7DDC7'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(sx + (20 + i * 20) * z, sy + 15 * z, 5.5 * z, 0, TAU); x.fill(); });
  textLines(x, sx, sy + 36 * z, W, H - 40 * z, z, T, seed, th);
}

function drawWindows(x: CanvasRenderingContext2D, fmt: Format, cam: Cam, T: number, th: Theme): void {
  ghostWindow(x, fmt, cam, T, WORLD.win3, 3, th);
  ghostWindow(x, fmt, cam, T, WORLD.win2, 2, th);
  ghostWindow(x, fmt, cam, T, WORLD.win, 1, th);
}

export interface TaskbarOpts {
  /** fake sessions for the little progress lines under pets (x in world pu) */
  bars?: { x: number; session: Pick<Session, 'agent' | 'state' | 'progress'>; music?: 'dance' | 'doze' | null }[];
  limits?: Limit[];
  /** 0..1: how far the taskbar has slid in (intro) */
  show?: number;
}

const ICONS = ['#3A7BD5', '#D97757', '#5DCAA5', '#EF9F27'];

export function drawTaskbar(x: CanvasRenderingContext2D, fmt: Format, cam: Cam, T: number, o: TaskbarOpts = {}): void {
  const z = cam.z, [x0, y0] = worldToScreen(cam, fmt, WORLD.barX0, 0), W = (WORLD.barX1 - WORLD.barX0) * z, H = WORLD.barH * z;
  if (y0 > fmt.H + 4) return;
  x.save();
  // the bar floats with cream below it in wide portrait shots, and runs off the bottom of the frame when it would end just inside it
  const ext = !fmt.portrait || y0 + H > fmt.H - 110 ? fmt.H - y0 - H + 40 : 0;
  x.fillStyle = PAL.bar; rr(x, x0, y0, W, H + Math.max(0, ext), 16 * z); x.fill();
  x.fillStyle = PAL.barEdge; x.beginPath(); x.roundRect(x0 + 8 * z, y0 + 2 * z, W - 16 * z, 3 * z, 1.5 * z); x.fill();
  const mid = y0 + H * 0.52;
  // a few app icons, nothing branded
  ICONS.forEach((c, i) => { x.fillStyle = c; rr(x, x0 + (60 + i * 42) * z, mid - 14 * z, 28 * z, 28 * z, 8 * z); x.fill(); });
  // tray: chevron, Wi-Fi, speaker, clock
  const tx = worldToScreen(cam, fmt, WORLD.trayX, 0)[0];
  x.strokeStyle = '#E9E2DA'; x.fillStyle = '#E9E2DA'; x.lineWidth = 2.6 * z; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(tx - 6 * z, mid + 3 * z); x.lineTo(tx, mid - 3 * z); x.lineTo(tx + 6 * z, mid + 3 * z); x.stroke();
  [7, 13].forEach(r => { x.beginPath(); x.arc(tx + 42 * z, mid + 8 * z, r * z, -2.3, -.84); x.stroke(); });
  x.beginPath(); x.arc(tx + 42 * z, mid + 8 * z, 2.2 * z, 0, TAU); x.fill();
  x.beginPath(); x.moveTo(tx + 70 * z, mid - 4 * z); x.lineTo(tx + 75 * z, mid - 4 * z); x.lineTo(tx + 81 * z, mid - 10 * z); x.lineTo(tx + 81 * z, mid + 10 * z); x.lineTo(tx + 75 * z, mid + 4 * z); x.lineTo(tx + 70 * z, mid + 4 * z); x.closePath(); x.fill();
  x.beginPath(); x.arc(tx + 84 * z, mid, 7 * z, -.8, .8); x.stroke();
  x.font = `700 ${18 * z}px ${UI_FONT}`; x.textAlign = 'right'; x.textBaseline = 'middle'; x.fillText('12:00', tx + 168 * z, mid + 1 * z); x.textAlign = 'left';
  x.restore();

  // the app's own HUD: 5-hour and weekly limit bars next to the tray, and a line under each pet
  if (o.limits) {
    const [lx] = worldToScreen(cam, fmt, WORLD.limitsX, 0), k = z * (WORLD.barH / 48);
    x.save(); x.translate(lx, y0); x.scale(k, k); drawLimits(x, 0, 48, limitBars(o.limits)); x.restore();
  }
  for (const b of o.bars ?? []) {
    const [bx] = worldToScreen(cam, fmt, b.x, 0), k = z * 1.25;
    x.save(); x.translate(bx, y0 + H * 0.58); x.scale(k, k); drawProgress(x, 0, 0, b.session as Session, T, b.music ?? null); x.restore();
  }
}

/** Windows-style arrow pointer, tip at (0, 0) pointing up-left. `size` is px for the whole arrow height. */
export function drawCursor(x: CanvasRenderingContext2D, sx: number, sy: number, size: number, rot = 0, alpha = 1, press = 0): void {
  const k = size / 24;
  x.save(); x.globalAlpha *= alpha; x.translate(sx, sy); x.rotate(rot); x.scale(k * (1 - 0.12 * press), k * (1 - 0.12 * press));
  x.beginPath();
  x.moveTo(0, 0); x.lineTo(0, 19); x.lineTo(4.6, 14.8); x.lineTo(7.8, 22.4); x.lineTo(11.2, 21); x.lineTo(8.1, 13.6); x.lineTo(14.2, 13.4); x.closePath();
  x.shadowColor = 'rgba(43,38,34,0.28)'; x.shadowBlur = 7; x.shadowOffsetY = 3;
  x.fillStyle = '#FFFFFF'; x.fill();
  x.shadowColor = 'transparent';
  x.lineJoin = 'round'; x.lineWidth = 2.4; x.strokeStyle = '#1F1C1A'; x.stroke();
  x.restore();
}
