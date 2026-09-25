import { MOTIONS, effective } from '../motion';
import { drawFx } from '../motion/fx';
import { tick } from '../motion/tick';
import { STYLES } from '../styles';
import type { Look } from '../types';
import { drawPet } from './draw/body';
import type { Pet } from './pet';

export interface PaintFrame { dt: number; t0: number; X: number; Y: number; u: number; look: Look; animate: boolean; saving: boolean; reduced: boolean; dpr: number }
export interface Surface { canvas: CanvasImageSource & { width: number; height: number }; ctx: CanvasRenderingContext2D }
export type SurfaceFactory = (w: number, h: number, read?: boolean) => Surface;
interface Layer extends Surface { ox: number; oy: number; w: number; h: number }

/** Obszar zwierzaka z rekwizytami i cząstkami, w jednostkach u wokół (X, Y). */
export const BOX = { l: 160, r: 170, t: 190, b: 20 };
/** Prędkość (jednostki zwierzaka na sekundę), od której widać smugi. */
export const TRAIL_SPEED = 35;
const GHOST = [0.14, 0.24, 0.38];

const domSurface: SurfaceFactory = (w, h, read) => {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: !!read })! };
};

/** Pixel-art: płótno wygładza krawędzie nawet w małej rozdzielczości; próg przezroczystości daje ostre piksele. */
function crisp(l: Surface): void {
  const w = l.canvas.width, h = l.canvas.height;
  const img = l.ctx.getImageData(0, 0, w, h) as ImageData | undefined;
  if (!img?.data) return;
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] < 110 ? 0 : 255;
  l.ctx.setTransform(1, 0, 0, 1, 0, 0);
  l.ctx.putImageData(img, 0, 0);
}

/** Jedno wejście rysowania zwierzaka: zegar ruchu, styl, warstwa (Pixel-art, smugi) i efekty Anime. */
export class PetPainter {
  energy = 0;
  private ring: Layer[] = [];
  private prev: number[][] | null = null;
  constructor(readonly pet: Pet, private make: SurfaceFactory = domSurface) {}

  frame(x: CanvasRenderingContext2D, f: PaintFrame): void {
    const base = MOTIONS[f.look.motion] ?? MOTIONS.calm, m = effective(base, f), st = STYLES[f.look.style] ?? STYLES.clean;
    const t = tick(this.pet, f.dt, f.t0, base, f.animate);
    if (!st.pixel && !m.trails) {
      this.ring.length = 0;
      drawPet(x, this.pet, f.X, f.Y, f.u, t, f.look);
      this.measure(f.dt);
      drawFx(x, this.pet, f.X, f.Y, f.u, t, m, this.energy);
      return;
    }
    const res = st.pixel ? 1 / Math.max(st.pixel.minPx, st.pixel.perU * f.u) : f.dpr;
    const w = (BOX.l + BOX.r) * f.u, h = (BOX.t + BOX.b) * f.u, ox = f.X - BOX.l * f.u, oy = f.Y - BOX.t * f.u;
    const keep = m.trails ? GHOST.length + 1 : 1;
    const ghosts = m.trails ? this.ring.slice(-GHOST.length) : [];
    const layer = this.take(Math.ceil(w * res), Math.ceil(h * res), keep, !!st.pixel);
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.ctx.setTransform(res, 0, 0, res, -ox * res, -oy * res);
    drawPet(layer.ctx, this.pet, f.X, f.Y, f.u, t, f.look);
    if (st.pixel) crisp(layer);
    Object.assign(layer, { ox, oy, w, h });
    this.measure(f.dt);
    x.save();
    if (st.pixel) x.imageSmoothingEnabled = false;
    if (this.energy > TRAIL_SPEED) ghosts.forEach((g, i) => {
      x.globalAlpha = GHOST[GHOST.length - ghosts.length + i];
      x.drawImage(g.canvas, g.ox, g.oy, g.w, g.h);
    });
    x.globalAlpha = 1;
    x.drawImage(layer.canvas, ox, oy, w, h);
    x.restore();
    this.ring.push(layer);
    drawFx(x, this.pet, f.X, f.Y, f.u, t, m, this.energy);
  }

  /** Najstarsza warstwa (nie jest wśród duchów tej klatki) wraca do użytku; nowa tylko przy niepełnej puli. */
  private take(pw: number, ph: number, keep: number, read: boolean): Layer {
    const l = this.ring.length >= keep ? this.ring.shift() : undefined;
    while (this.ring.length > keep - 1) this.ring.shift(); // ruch zmienił się z Anime na Spokojny
    if (!l) return { ...this.make(pw, ph, read), ox: 0, oy: 0, w: 0, h: 0 };
    if (l.canvas.width !== pw || l.canvas.height !== ph) { l.canvas.width = pw; l.canvas.height = ph; }
    return l;
  }

  /** Energia = największa prędkość dłoni albo ciała, wygładzona. */
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
