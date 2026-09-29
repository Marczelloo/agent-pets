import { PI } from "../math";
import { rrP, seg, shp } from "../pen";
import type { Skin } from "../../skins/types";

/** Wysokość lewitacji (w jednostkach `u`): skóra z `float` unosi się 7 u nad ziemią i faluje o ±2,2 u. */
export function floatLift(sk: Skin, t: number, seed: number): number {
  return sk.float ? 7 + 2.2 * Math.sin(t * 2.6 + seed) : 0;
}

/** Ludzik Androida: głowa-kopułka (półelipsa) nad tułowiem, rozdzielone szczeliną; tułów z zaokrąglonymi dolnymi rogami
 * (promień `R`). Zwraca dwa obrysy: [głowa, tułów]. */
export function androidP(X: number, Y: number, W: number, H: number, R: number): number[][][] {
  if (W < 0) { X += W; W = -W; }
  W = Math.max(W, .01); H = Math.max(H, .01);
  const hh = Math.min(W * .46, H * .44), gap = H * .05, n = 36, cx = X + W / 2, head: number[][] = [];
  for (let i = 0; i <= n; i++) { const a = PI + PI * i / n; head.push([cx + Math.cos(a) * W / 2, Y + hh + Math.sin(a) * hh]); }
  const ty = Y + hh + gap, th = Math.max(.01, H - hh - gap), r = Math.max(0, Math.min(R, W / 2, th / 2)), r0 = Math.min(r, W * .04), torso: number[][] = [];
  const corner = (ccx: number, ccy: number, rr: number, a0: number) => { for (let i = 0; i <= 5; i++) { const a = a0 + PI / 2 * i / 5; torso.push([ccx + Math.cos(a) * rr, ccy + Math.sin(a) * rr]); } };
  corner(X + W - r0, ty + r0, r0, -PI / 2); corner(X + W - r, ty + th - r, r, 0); corner(X + r, ty + th - r, r, PI / 2); corner(X + r0, ty + r0, r0, PI);
  return [head, torso];
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

/** Dwie antenki ludzika Androida: z kopułki głowy (`top`, szerokość `fw`) na ukos w górę; `wig` kołysze końcami. */
export function drawAndroidAntennas(x: CanvasRenderingContext2D, cx: number, top: number, fw: number, H: number, u: number, col: string, lw: number, wig: number) {
  const hh = Math.min(fw * .46, H * .44);
  for (const s of [-1, 1]) {
    const a = s * (.62 + .08 * wig), bx = cx + Math.sin(s * .55) * fw / 2 * .9, by = top + hh - Math.cos(.55) * hh * .98, len = 11 * u;
    seg(x, bx, by, bx + Math.sin(a) * len, by - Math.cos(a) * len, 4.2 * u, col, lw);
  }
}
