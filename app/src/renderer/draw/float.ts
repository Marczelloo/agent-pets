import { PI } from "../math";
import { bbox, path, rrP, shp } from "../pen";
import type { Skin } from "../../skins/types";

/** Gogle Copilota: jasna oprawa i ciemne soczewki (kształt z logo Copilota). */
export const GOGGLE_FRAME = '#EDE6FF';
export const GOGGLE_LENS = '#15121F';
const GOGGLE_STRAP = '#7C5CC4';
/** Kolory Google na łuku Antigravity. */
export const GOOGLE = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'] as const;

/** Wysokość lewitacji (w jednostkach `u`): skóra z `float` unosi się 7 u nad ziemią i faluje o ±2,2 u. */
export function floatLift(sk: Skin, t: number, seed: number): number {
  return sk.float ? 7 + 2.2 * Math.sin(t * 2.6 + seed) : 0;
}

/** Łuk „A”: prostokąt z zaokrągloną górą (promień `R`, jak w `rrP`) i otworem w dolnej części, na środku. */
export function archP(X: number, Y: number, W: number, H: number, R: number): number[][] {
  if (W < 0) { X += W; W = -W; }
  W = Math.max(W, .01); H = Math.max(H, .01);
  const r = Math.max(0, Math.min(R, W / 2, H / 2)), n = 6, p: number[][] = [];
  const wi = W * .36, hi = Math.min(H * .34, H - r), ri = wi / 2, cx = X + W / 2;
  p.push([X, Y + H]);
  for (let i = 0; i <= n; i++) { const a = PI + PI / 2 * i / n; p.push([X + r + Math.cos(a) * r, Y + r + Math.sin(a) * r]); }
  for (let i = 0; i <= n; i++) { const a = -PI / 2 + PI / 2 * i / n; p.push([X + W - r + Math.cos(a) * r, Y + r + Math.sin(a) * r]); }
  p.push([X + W, Y + H], [cx + ri, Y + H]);
  // otwór: w górę prawą krawędzią, łukiem nad środkiem, w dół lewą
  const top = Y + H - hi + ri;
  for (let i = 0; i <= n; i++) { const a = -PI * i / n; p.push([cx + Math.cos(a) * ri, top + Math.sin(a) * ri]); }
  p.push([cx - ri, Y + H]);
  return p;
}

/** Gradient w kolorach Google w obrysie `p`, potem ponownie kontur (wypełnienie go przykryło). */
export function googleFill(x: CanvasRenderingContext2D, p: number[][]) {
  const b = bbox(p), g = x.createLinearGradient(b[0], b[1], b[2], b[3]);
  GOOGLE.forEach((c, i) => g.addColorStop(i / (GOOGLE.length - 1), c));
  x.save(); path(x, p, 0, 0); x.clip(); x.globalAlpha *= .92; x.fillStyle = g; x.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); x.restore();
  path(x, p, 0, 0); x.stroke();
}

/** Gogle pilota na czole: pasek, dwie soczewki w jasnej oprawie i mostek (`co` = obrót przodu). */
export function drawGoggles(x: CanvasRenderingContext2D, cx: number, cy: number, W: number, co: number, u: number) {
  const gw = Math.max(.1, W * .3 * co), gh = W * .22, gap = W * .06 * co, inset = Math.min(2.4 * u, gw / 4);
  x.save(); x.fillStyle = GOGGLE_STRAP; x.fillRect(cx - W * .5 * co, cy - 1.8 * u, W * co, 3.6 * u); x.restore();
  shp(x, rrP(cx - gap / 2 - 1, cy - 1.6 * u, gap + 2, 3.2 * u, 1.2 * u), GOGGLE_FRAME, u);
  for (const s of [-1, 1]) {
    const lx = cx + s * (gap / 2 + gw / 2);
    shp(x, rrP(lx - gw / 2, cy - gh / 2, gw, gh, gh * .45), GOGGLE_FRAME, u);
    shp(x, rrP(lx - gw / 2 + inset, cy - gh / 2 + inset, gw - 2 * inset, gh - 2 * inset, gh * .35), GOGGLE_LENS, u, { noStroke: 1 });
    x.save(); x.strokeStyle = '#FFFFFF'; x.globalAlpha *= .7; x.lineWidth = Math.max(.8, 1.6 * u); x.beginPath();
    x.arc(lx - gw * .12, cy - gh * .05, Math.max(.5, gh * .22), 1.05 * PI, 1.45 * PI); x.stroke(); x.restore();
  }
}
