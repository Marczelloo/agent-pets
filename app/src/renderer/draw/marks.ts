import { path, pen, elP, rrP, shp } from "../pen";
import type { Skin } from "../../skins/types";

/** Color through style like any fill (Ink gray, Pastel lighter). */
const tone = (c: string) => pen.st.fillFor ? pen.st.fillFor(c) : c;

/** Cursor hexagon: rectangle with cut sides (flat top and bottom so legs meet the body). `R` ignored. */
export function hexP(X: number, Y: number, W: number, H: number, _R?: number): number[][] {
  if (W < 0) { X += W; W = -W; }
  W = Math.max(W, .01); H = Math.max(H, .01);
  const c = Math.min(W * .2, H / 2);
  return [[X + c, Y], [X + W - c, Y], [X + W, Y + H / 2], [X + W - c, Y + H], [X + c, Y + H], [X, Y + H / 2]];
}

/** Half of Grok's shoulder width (fraction of body width); arms attach there too */
export const DROID_SHOULDER = .4;

/** Grok humanoid silhouette: small rounded head, neck, broad shoulders, torso narrowing to waist and hips. `R` ignored. */
export function droidP(X: number, Y: number, W: number, H: number, _R?: number): number[][] {
  if (W < 0) { X += W; W = -W; }
  W = Math.max(W, .01); H = Math.max(H, .01);
  const cx = X + W / 2, p: number[][] = [], n = 5, PI = Math.PI;
  const arc = (ax: number, ay: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); }
  };
  // head to .34 height (.5 width), neck to .42, shoulders at .8 width (arms start there), waist at .8 (.44 width), hips .54 width
  const hw = W * .25, hh = H * .34, hr = Math.min(hw, hh) * .6, nw = W * .11, ny = H * .42 + Y, sr = Math.min(W * .12, H * .1);
  const wy = Y + H * .8, ww = W * .22, pw = W * .27, si = W * (.5 - DROID_SHOULDER);
  arc(cx + hw - hr, Y + hr, hr, -PI / 2, 0);
  arc(cx + hw - hr * .5, Y + hh - hr * .5, hr * .5, 0, PI / 2);
  p.push([cx + nw, Y + hh], [cx + nw, ny]);
  arc(X + W - si - sr, ny + sr, sr, -PI / 2, 0);
  p.push([cx + ww, wy], [cx + pw, Y + H], [cx - pw, Y + H], [cx - ww, wy]);
  arc(X + si + sr, ny + sr, sr, PI, PI * 1.5);
  p.push([cx - nw, ny], [cx - nw, Y + hh]);
  arc(cx - hw + hr * .5, Y + hh - hr * .5, hr * .5, PI / 2, PI);
  arc(cx - hw + hr, Y + hr, hr, PI, PI * 1.5);
  return p;
}

/** Panda ears: behind the body at the top, like Copilot helmet ears. */
export function drawEars(x: CanvasRenderingContext2D, sk: Skin, hW: number, top: number, u: number) {
  if (sk.panda) for (const s of [-1, 1]) shp(x, elP(s * hW * .62, top + 3 * u, 9 * u, 9 * u), sk.panda.ears, u);
}

/** Fill inside the front outline, then draw the outline again (the fill covered it). */
function inside(x: CanvasRenderingContext2D, fp: number[][], draw: () => void) {
  x.save(); path(x, fp, 0, 0); x.clip(); draw(); x.restore();
  path(x, fp, 0, 0); x.stroke();
}

export interface Face { cx: number; top: number; fw: number; H: number; u: number; co: number; ey: number; eyes: number[]; eh: number }

/**
 * Markings on the body front, after the body and before the eyes: Cursor facet, Grok visor and logo, ZCode panda patches and band.
 * `fp` = obrys przodu.
 */
export function drawMarks(x: CanvasRenderingContext2D, sk: Skin, fp: number[][], f: Face) {
  const { cx, top, fw, H, u, co, ey, eyes, eh } = f, X = cx - fw / 2;
  if (sk.facet) {
    const c = Math.min(fw * .2, H / 2), fc = sk.facet;
    inside(x, fp, () => {
      x.fillStyle = tone(fc.light); x.beginPath(); x.moveTo(X + c, top); x.lineTo(X + fw - c, top); x.lineTo(X, top + H / 2); x.closePath(); x.fill();
      x.strokeStyle = tone(fc.edge); x.lineWidth = Math.max(.8, 1.8 * u); x.beginPath(); x.moveTo(X + fw - c, top); x.lineTo(X, top + H / 2); x.stroke();
    });
  }
  if (sk.droid) {
    // black neck between head and shoulders
    const d = sk.droid, vw = fw * .4, vy = top + H * .05, vh = H * .22;
    inside(x, fp, () => {
      shp(x, rrP(cx - fw * .14, top + H * .33, fw * .28, H * .1, 0), d.visor, u, { noStroke: 1 });
      // black belt above the hips, like the robot
      shp(x, rrP(cx - fw * .35, top + H * .79, fw * .7, H * .07, 0), d.visor, u, { noStroke: 1 });
    });
    // visor on the head
    shp(x, rrP(cx - vw / 2, vy, vw, vh, Math.min(vh * .45, vw / 2)), d.visor, u);
    // reflection on the visor glass
    x.save(); x.globalAlpha *= .5; shp(x, rrP(cx - vw * .32, vy + vh * .12, vw * .22, vh * .1, vh * .05), '#5A5A5E', u, { noStroke: 1 }); x.restore();
    // Grok logo: ring with a gap at upper right, a stroke extending through the gap
    const r = Math.min(fw * .1, H * .075);
    x.save(); x.translate(cx, top + H * .6); x.scale(Math.max(.05, co), 1);
    x.strokeStyle = tone(d.logo); x.lineWidth = Math.max(1, r * .28); x.lineCap = 'butt';
    x.beginPath(); x.ellipse(0, 0, r, r, 0, -Math.PI * .15, Math.PI * 1.6); x.stroke();
    x.beginPath(); x.moveTo(-r * .55, r * .55); x.lineTo(r * 1.35, -r * 1.35); x.stroke();
    x.restore();
  }
  if (sk.panda) {
    const p = sk.panda, k = Math.sqrt(Math.max(0, co));
    eyes.forEach((ex, i) => shp(x, elP(ex, ey + 2 * u, (sk.eyeW / 2 + 5) * u * Math.max(.3, k), eh / 2 + 5 * u, (i ? -1 : 1) * .45), p.patches, u, { noStroke: 1 }));
    const by = top + H * .1, bh = H * .16;
    inside(x, fp, () => shp(x, rrP(X - 2 * u, by, fw + 4 * u, bh, 0), p.band, u));
    x.save(); x.fillStyle = tone(p.mark); x.font = `bold ${Math.max(6, bh * .85)}px ${pen.font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.translate(cx, by + bh / 2); x.scale(Math.max(.05, co), 1); x.fillText('Z', 0, 0); x.restore();
  }
}
