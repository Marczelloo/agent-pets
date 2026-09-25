import { MOTIONS, effective } from '../motion';
import { drawFx } from '../motion/fx';
import { tick } from '../motion/tick';
import type { Look } from '../types';
import { drawPet } from './draw/body';
import { pen } from './pen';
import type { Pet } from './pet';

export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }

/**
 * Jedno wejście rysowania zwierzaka: zegar ruchu, model stylu i efekty Anime. Zawsze wprost na scenę:
 * bez warstwy poza ekranem i bez duchów poprzednich klatek (spec wyglądu v2, 3).
 */
export class PetPainter {
  energy = 0;
  private prev: number[][] | null = null;
  constructor(readonly pet: Pet) {}

  frame(x: CanvasRenderingContext2D, f: PaintFrame): void {
    const base = MOTIONS[f.look.motion] ?? MOTIONS.calm, m = effective(base, f);
    const t = tick(this.pet, f.dt, f.t0, base, f.animate);
    pen.dpr = f.dpr;
    drawPet(x, this.pet, f.X, f.Y, f.u, t, f.look);
    this.measure(f.dt);
    drawFx(x, this.pet, f.X, f.Y, f.u, t, m, this.energy);
  }

  /** Energia = największa prędkość dłoni albo ciała, wygładzona (efekty Anime). */
  private measure(dt: number): void {
    const hands: number[][] = this.pet.hand ?? [];
    let raw = 0;
    if (this.prev && dt > 0) {
      hands.forEach((p, i) => { const q = this.prev![i]; if (q) raw = Math.max(raw, Math.hypot(p[0] - q[0], p[1] - q[1]) / dt); });
      raw = Math.max(raw, Math.abs(this.pet.p.lx.v), Math.abs(this.pet.p.th.v) * 40);
    }
    this.prev = hands.map(p => [p[0], p[1]]);
    this.energy = this.energy * 0.7 + raw * 0.3;
  }
}
