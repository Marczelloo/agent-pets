import { MOTIONS } from '../motion';
import { tick } from '../motion/tick';
import type { Look } from '../types';
import { drawPet } from './draw/body';
import { pen } from './pen';
import { setMotion, type Pet } from './pet';

export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }

/**
 * Jedno wejście rysowania zwierzaka: zegar ruchu, model stylu i efekty Anime. Zawsze wprost na scenę:
 * bez warstwy poza ekranem i bez duchów poprzednich klatek (spec wyglądu v2, 3).
 */
export class PetPainter {
  constructor(readonly pet: Pet) {}

  frame(x: CanvasRenderingContext2D, f: PaintFrame): void {
    const base = MOTIONS[f.look.motion] ?? MOTIONS.calm;
    setMotion(this.pet, base.id === 'anime');
    const t = tick(this.pet, f.dt, f.t0, base, f.animate);
    pen.dpr = f.dpr;
    drawPet(x, this.pet, f.X, f.Y, f.u, t, f.look);
  }
}
