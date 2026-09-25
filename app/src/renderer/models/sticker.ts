// Model naklejki (task 4): na razie bryła z płaskiego szkieletu.
import { SKINS } from '../../skins';
import type { Look } from '../../types';
import { pen } from '../pen';
import type { Pet } from '../pet';
import { rig } from './rig';

export function drawSticker(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, _look: Look): void {
  const sk = SKINS[c.type], r = rig(c, X, Y, u, t, { w: sk.width, h: sk.height, arm: sk.armLen });
  x.save();
  x.globalAlpha = r.alpha;
  x.fillStyle = sk.pal.m;
  x.strokeStyle = pen.ol;
  x.fillRect(r.XX - r.W / 2, r.Y + r.top + r.oy, r.W, r.H);
  for (const a of r.arms) x.fillRect(r.XX + a.hx - 3 * u, r.Y + a.hy - 3 * u, 6 * u, 6 * u);
  x.restore();
}
