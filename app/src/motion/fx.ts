import { PI, TAU, cl } from '../renderer/math';
import { pen } from '../renderer/pen';
import type { Pet } from '../renderer/pet';
import type { MotionDef } from './types';

const HIT = 20 / TAU; // takt uderzeń klawiszy (sin(t·20) w scenach pisania)

/** Efekty Anime rysowane poza ciałem: linie prędkości, impakty, wybuch po skończeniu, emotki. */
export function drawFx(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, m: MotionDef, energy: number): void {
  if (c.fxSt !== c.st) { if (c.st === 'done' && c.fxSt != null) c.fxDoneAt = t; c.fxSt = c.st; }
  if (!m.speedLines && !m.impacts && !m.emotes) return;
  const P = c.p, XX = X + P.lx.x * u, lw = Math.max(1, 1.6 * u), a = c.alpha ?? 1;
  const hands: number[][] = c.hand ?? [];
  const line = (x1: number, y1: number, x2: number, y2: number) => { x.moveTo(x1, y1); x.lineTo(x2, y2); };
  const begin = (col: string, alpha: number) => { x.save(); x.globalAlpha = a * alpha; x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'round'; x.beginPath(); };
  const end = () => { x.stroke(); x.restore(); };

  if (m.speedLines && cl(P.typeW.x) > 0.5 && energy > 20) {
    begin(pen.ol, 0.55);
    hands.forEach(([hx, hy], i) => {
      for (let k = 0; k < 2; k++) {
        const y = Y + (hy - 4 + k * 7) * u, x0 = XX + (hx + (i ? 10 : -10)) * u;
        line(x0, y, x0 + (i ? 1 : -1) * (8 + 5 * k) * u, y);
      }
    });
    end();
  }
  if (m.speedLines && cl(P.walkW.x) > 0.5) {
    begin(pen.ol, 0.45);
    for (let k = 0; k < 3; k++) line(XX - (70 + 6 * k) * u, Y - (20 + 14 * k) * u, XX - (90 + 10 * k) * u, Y - (20 + 14 * k) * u);
    end();
  }
  if (m.speedLines && cl(P.hopW.x) > 0.5 && (c.hp % 1) < 0.3) {
    begin(pen.ol, 0.45);
    for (let k = -1; k <= 1; k++) line(XX + k * 22 * u, Y + 2 * u, XX + k * 22 * u, Y + 12 * u);
    end();
  }

  if (m.impacts && cl(P.typeW.x) > 0.5 && hands[1]) {
    const ph = t * HIT, beat = Math.floor(ph);
    if (beat % 3 === 0 && ph - beat < 0.35) {
      const [hx, hy] = hands[1], cx = XX + hx * u, cy = Y + (hy + 4) * u;
      begin('#EF9F27', 0.9);
      for (let k = 0; k < 4; k++) {
        const an = -PI / 2 + (k - 1.5) * 0.5;
        line(cx + Math.cos(an) * 5 * u, cy + Math.sin(an) * 5 * u, cx + Math.cos(an) * 12 * u, cy + Math.sin(an) * 12 * u);
      }
      end();
    }
  }
  if (m.impacts && c.fxDoneAt != null && t - c.fxDoneAt < 0.15) {
    begin('#EF9F27', 0.9);
    for (let k = 0; k < 10; k++) {
      const an = TAU * k / 10;
      line(XX + Math.cos(an) * 55 * u, Y - 40 * u + Math.sin(an) * 45 * u, XX + Math.cos(an) * 80 * u, Y - 40 * u + Math.sin(an) * 65 * u);
    }
    end();
  }

  if (!m.emotes) return;
  const head = Y - 85 * u, bob = Math.abs(Math.sin(t * 8));
  if (c.st === 'error') {
    x.save(); x.globalAlpha = a; x.fillStyle = '#85B7EB'; x.strokeStyle = pen.ol; x.lineWidth = Math.max(0.8, u);
    const dx = XX + 48 * u, dy = head + 10 * u + (t * 30 % 12) * u;
    x.beginPath(); x.moveTo(dx, dy - 7 * u);
    x.quadraticCurveTo(dx + 6 * u, dy + 2 * u, dx, dy + 4 * u); x.quadraticCurveTo(dx - 6 * u, dy + 2 * u, dx, dy - 7 * u);
    x.fill(); x.stroke(); x.restore();
    begin('#E24B4A', 1);
    x.lineWidth = Math.max(1.2, 2.2 * u);
    const vx = XX - 38 * u, vy = head;
    for (let k = 0; k < 4; k++) {
      const an = k * PI / 2 + PI / 4;
      x.moveTo(vx + Math.cos(an) * 3 * u, vy + Math.sin(an) * 3 * u);
      x.arc(vx + Math.cos(an) * 7 * u, vy + Math.sin(an) * 7 * u, 4 * u, an + PI * 0.75, an + PI * 1.25);
    }
    end();
  }
  if (c.st === 'needs') {
    x.save(); x.globalAlpha = a; x.fillStyle = '#EF9F27'; x.strokeStyle = pen.ol; x.lineWidth = Math.max(1, 2 * u);
    x.font = `900 ${Math.max(12, 34 * u)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'bottom';
    const yy = head - 18 * u - bob * 8 * u;
    x.strokeText('!', XX + 40 * u, yy); x.fillText('!', XX + 40 * u, yy);
    x.restore();
  }
}
