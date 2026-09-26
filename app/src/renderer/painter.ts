import { MOTIONS, effective } from '../motion';
import { drawFxBack, drawFxFront, flashFrame, recordTrail, shakeOffset, stretchOf, type FxCtx } from '../motion/fx';
import { tick } from '../motion/tick';
import { ACCENT, STYLES } from '../styles';
import type { Look } from '../types';
import { fxState } from './anime/state';
import { drawPet } from './draw/body';
import { gridPx } from './models/pixel';
import { pen } from './pen';
import { setMotion, type Pet } from './pet';

export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }

/**
 * Jedno wejście rysowania zwierzaka: zegar ruchu, model stylu i efekty Anime. Zawsze wprost na scenę,
 * bez warstwy poza ekranem i bez duchów (spec wyglądu v2, 3 i 8).
 */
export class PetPainter {
  constructor(readonly pet: Pet) {}

  frame(x: CanvasRenderingContext2D, f: PaintFrame): void {
    const pet = this.pet, base = MOTIONS[f.look.motion] ?? MOTIONS.calm, env = effective(base, f);
    setMotion(pet, base.fx);
    const t = tick(pet, f.dt, f.t0, base, f.animate);
    pen.dpr = f.dpr;
    if (!env.fx) { drawPet(x, pet, f.X, f.Y, f.u, t, f.look); return; }
    const st = STYLES[f.look.style] ?? STYLES.clean, s = fxState(pet), pixel = st.model === 'pixel';
    s.env = env;
    const flash = flashFrame(s, f.t0, env);
    const [dx, dy] = shakeOffset(s, t, env, f.u, pixel ? gridPx(f.u, f.dpr) / f.dpr : 0);
    const g: FxCtx = { X: f.X + dx, Y: f.Y + dy, u: f.u, t, dpr: f.dpr, env, model: st.model, flash, accent: ACCENT[pet.type], alpha: pet.alpha ?? 1 };
    drawFxBack(x, pet, g);
    const k = pixel ? 0 : stretchOf(pet);
    x.save();
    if (flash) x.filter = 'invert(1)';
    if (k > 0) { const cx = g.X + pet.p.lx.x * f.u, cy = g.Y - 35 * f.u; x.translate(cx, cy); x.scale(1 + k, 1 - k * 0.5); x.translate(-cx, -cy); }
    drawPet(x, pet, g.X, g.Y, f.u, t, f.look);
    x.restore();
    recordTrail(s, pet, f.t0);
    drawFxFront(x, pet, g);
  }
}
