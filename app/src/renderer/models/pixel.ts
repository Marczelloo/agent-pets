// Model pikselowy (task 5): na razie bryła z płaskiego szkieletu na siatce.
import { SKINS } from '../../skins';
import type { Look } from '../../types';
import { pen } from '../pen';
import type { Pet } from '../pet';
import { rig } from './rig';

export function drawPixel(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, _look: Look): void {
  const sk = SKINS[c.type], r = rig(c, X, Y, u, t, { w: sk.width, h: sk.height, arm: sk.armLen });
  const g = Math.max(1, Math.round(5 * u * pen.dpr)) / pen.dpr, snap = (v: number) => Math.round(v / g) * g;
  x.save();
  x.globalAlpha = r.alpha;
  x.fillStyle = sk.pal.s;
  x.fillRect(snap(r.XX - r.W / 2), snap(r.Y + r.top + r.oy), snap(r.W), snap(r.H));
  for (const a of r.arms) x.fillRect(snap(r.XX + a.hx), snap(r.Y + a.hy), 2 * g, 2 * g);
  x.restore();
}
