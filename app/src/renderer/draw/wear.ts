// Rzeczy „na sobie” dla odznak w oknie statystyk (spec 0.9, 3.3): korona, śliniaczek, szalik z lodu, szlafmyca,
// opaska. Rysowane przez `pen`, więc biorą kontur i kreskowanie ze stylu. Zaczepione w bryle zwierzaka:
// `top` to jej górna krawędź, `w` i `h` szerokość i wysokość (w układzie bryły, u = skala).
import { TAU } from '../math';
import { elP, pen, rrP, shp } from '../pen';

export type Wear = 'crown' | 'bib' | 'scarf' | 'nightcap' | 'headband';
export const WEAR: Wear[] = ['crown', 'bib', 'scarf', 'nightcap', 'headband'];
export interface WearAnchor { x: number; top: number; w: number; h: number; rot: number }

const GOLD = '#E3AE3A', RED = '#E24B4A', ICE = '#B5D4F4', ICE_D = '#85B7EB', CAP = '#378ADD', PAPER = '#FAF9F5';

export function drawWear(x: CanvasRenderingContext2D, kind: string, a: WearAnchor, u: number, lw: number): void {
  const { top, w, h } = a;
  x.save();
  x.translate(a.x, 0);
  if (a.rot) x.rotate(a.rot);
  x.lineWidth = lw;
  x.strokeStyle = pen.ol;
  x.lineJoin = 'round';
  switch (kind) {
    case 'crown': {
      const hw = w * .28, base = top + 3 * u, ht = h * .34;
      shp(x, [[-hw, base], [-hw, base - ht * .55], [-hw * .5, base - ht * .2], [0, base - ht], [hw * .5, base - ht * .2], [hw, base - ht * .55], [hw, base]], GOLD, u);
      shp(x, elP(0, base - ht * .45, 2.4 * u, 2.4 * u), RED, u, { noStroke: 1 });
      break;
    }
    case 'nightcap': {
      const hw = w * .36, base = top + 4 * u;
      shp(x, [[-hw, base], [-hw * .4, top - h * .32], [w * .3, top - h * .42], [hw * .15, top - h * .12], [hw, base]], CAP, u);
      shp(x, rrP(-hw - 1 * u, base - 4 * u, 2 * hw + 2 * u, 6 * u, 3 * u), PAPER, u);
      shp(x, elP(w * .34, top - h * .42, 4.5 * u, 4.5 * u), PAPER, u);
      break;
    }
    case 'headband': {
      const y = top + h * .1;
      shp(x, rrP(-w * .49, y, w * .98, h * .13, 2 * u), RED, u);
      shp(x, [[w * .45, y + h * .06], [w * .62, y - h * .02], [w * .6, y + h * .14]], RED, u);
      break;
    }
    case 'bib': {
      const y = top + h * .56, hw = w * .3;
      shp(x, [[-hw, y], [hw, y], [hw * .78, y + h * .32], [-hw * .78, y + h * .32]], PAPER, u);
      x.save();
      x.strokeStyle = RED;
      x.lineWidth = Math.max(1, 1.6 * u);
      x.beginPath();
      x.moveTo(-hw * .7, y + h * .1); x.lineTo(hw * .7, y + h * .1);
      x.moveTo(-hw * .6, y + h * .2); x.lineTo(hw * .6, y + h * .2);
      x.stroke();
      x.restore();
      break;
    }
    case 'scarf': {
      const y = top + h * .62;
      shp(x, rrP(-w * .5, y, w, h * .14, 4 * u), ICE, u);
      shp(x, rrP(w * .12, y + h * .08, w * .14, h * .3, 3 * u), ICE_D, u);
      x.save();
      x.fillStyle = '#FFFFFF';
      for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(-w * .3 + i * w * .2, y + h * .07, 1.4 * u, 0, TAU); x.fill(); }
      x.restore();
      break;
    }
  }
  x.restore();
}
