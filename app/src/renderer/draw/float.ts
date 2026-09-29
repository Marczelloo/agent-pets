import { PI } from "../math";
import { bbox, path, pen, rrP, shp } from "../pen";
import type { Skin } from "../../skins/types";

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
  const st = pen.st, b = bbox(p), g = x.createLinearGradient(b[0], b[1], b[2], b[3]);
  // kolory przechodzą przez styl jak każde wypełnienie (Ink szary, Pastel jaśniejszy, Neon przyciemniony)
  GOOGLE.forEach((c, i) => g.addColorStop(i / (GOOGLE.length - 1), st.fillFor ? st.fillFor(c) : c));
  // szkic: kreskowanie ma zostać widoczne pod gradientem
  x.save(); path(x, p, 0, 0); x.clip(); x.globalAlpha *= st.sketch ? .5 : .92; x.fillStyle = g; x.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); x.restore();
  path(x, p, 0, 0); x.stroke();
}

/** Twarz z logo Copilota na przodzie ciała (`fw` = widoczna szerokość przodu): wizjer w dolnej części i dwie duże
 * soczewki gogli stykające się na środku, u góry. Oczy rysuje potem zwykły kod oczu, na wizjerze. */
export function drawPilot(x: CanvasRenderingContext2D, cx: number, top: number, fw: number, H: number, u: number,
  g: { frame: string; lens: string; visor: string }) {
  shp(x, rrP(cx - fw * .36, top + H * .34, fw * .72, H * .44, H * .17), g.visor, u);
  const lw = fw * .43, lh = H * .28, ly = top + H * .05, inset = Math.min(3 * u, lw / 5, lh / 5);
  for (const s of [-1, 1]) {
    const lx = cx + s * lw / 2;
    shp(x, rrP(lx - lw / 2, ly, lw, lh, lh * .42), g.frame, u);
    shp(x, rrP(lx - lw / 2 + inset, ly + inset, lw - 2 * inset, lh - 2 * inset, lh * .32), g.lens, u, { noStroke: 1 });
    x.save(); x.strokeStyle = '#FFFFFF'; x.globalAlpha *= .75; x.lineWidth = Math.max(.8, 1.8 * u); x.beginPath();
    x.arc(lx - lw * .1, ly + lh * .42, Math.max(.5, lh * .24), 1.05 * PI, 1.45 * PI); x.stroke(); x.restore();
  }
}
