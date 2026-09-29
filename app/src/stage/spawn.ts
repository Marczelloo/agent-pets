// Mini pet entrance (spec 0.8, 3.3): smoke poof in Calm style, summoning seal in Dynamic.
// `k` is progress from 0..1 over `SPAWN_S`; (cx, y) is the pet's base center, `u` its scale.
import { gridPx } from '../renderer/models/pixel';

export const SPAWN_S = 0.6;
const SMOKE = '#D8D5CC';

/** Draw the entrance effect; nothing after completion (`k` ≥ 1). Pixel art: rectangles on whole device pixels only. */
export function drawSpawn(x: CanvasRenderingContext2D, cx: number, y: number, u: number, k: number, motion: 'calm' | 'dynamic',
  pixel: boolean, dpr: number, accent: string): void {
  if (!(k >= 0 && k < 1)) return;
  const fade = 1 - k, R = 60 * u;
  x.save();
  x.globalAlpha = fade;
  if (pixel) {
    const g = gridPx(u, dpr) / dpr, snap = (v: number) => Math.round(v * dpr) / dpr;
    const cell = (px: number, py: number) => x.fillRect(snap(px), snap(py), g, g);
    if (motion === 'calm') {
      x.fillStyle = SMOKE;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, d = R * (0.3 + 0.7 * k);
        cell(cx + Math.cos(a) * d, y - 20 * u + Math.sin(a) * d * 0.6);
        cell(cx + Math.cos(a) * d + g, y - 20 * u + Math.sin(a) * d * 0.6);
      }
    } else {
      x.fillStyle = accent;
      const n = 16, r = R * (0.6 + 0.4 * k);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + k * 2;
        cell(cx + Math.cos(a) * r, y + Math.sin(a) * r * 0.3);
      }
    }
    x.restore();
    return;
  }
  if (motion === 'calm') {
    // smoke clouds spread from the center and fade
    x.fillStyle = SMOKE;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4, d = R * (0.25 + 0.75 * k), r = 14 * u * (1 - 0.4 * k);
      x.beginPath();
      x.arc(cx + Math.cos(a) * d, y - 22 * u + Math.sin(a) * d * 0.55, r, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    // summoning seal: circle on the ground with lines and a star; rotates and fades
    const r = R * (0.6 + 0.4 * k), rot = k * Math.PI;
    x.strokeStyle = accent;
    x.lineWidth = Math.max(1, 2.5 * u);
    x.shadowColor = accent;
    x.shadowBlur = 6;
    x.beginPath();
    x.ellipse(cx, y, r, r * 0.3, 0, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = rot + (i * 2 * Math.PI * 2) / 5;
      const px = cx + Math.cos(a) * r * 0.8, py = y + Math.sin(a) * r * 0.24;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.stroke();
  }
  x.restore();
}
