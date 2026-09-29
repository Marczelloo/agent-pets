import { path, pen, elP, rrP, shp } from "../pen";
import type { Skin } from "../../skins/types";

/** Kolor przez styl, jak każde wypełnienie (Ink szary, Pastel jaśniejszy). */
const tone = (c: string) => pen.st.fillFor ? pen.st.fillFor(c) : c;

/** Sześciokąt Cursora: prostokąt ze ściętymi bokami (płaska góra i dół, żeby nogi dotykały ciała). `R` pominięte. */
export function hexP(X: number, Y: number, W: number, H: number, _R?: number): number[][] {
  if (W < 0) { X += W; W = -W; }
  W = Math.max(W, .01); H = Math.max(H, .01);
  const c = Math.min(W * .2, H / 2);
  return [[X + c, Y], [X + W - c, Y], [X + W, Y + H / 2], [X + W - c, Y + H], [X + c, Y + H], [X, Y + H / 2]];
}

/** Uszy pandy: za ciałem, na górze, jak uszy hełmu Copilota. */
export function drawEars(x: CanvasRenderingContext2D, sk: Skin, hW: number, top: number, u: number) {
  if (sk.panda) for (const s of [-1, 1]) shp(x, elP(s * hW * .62, top + 3 * u, 9 * u, 9 * u), sk.panda.ears, u);
}

/** Wypełnienie w obrysie przodu, potem ponownie kontur (wypełnienie go przykryło). */
function inside(x: CanvasRenderingContext2D, fp: number[][], draw: () => void) {
  x.save(); path(x, fp, 0, 0); x.clip(); draw(); x.restore();
  path(x, fp, 0, 0); x.stroke();
}

export interface Face { cx: number; top: number; fw: number; H: number; u: number; co: number; ey: number; eyes: number[]; eh: number }

/**
 * Znaki na przodzie ciała, po ciele i przed oczami: fasetka Cursora, pierścień i ukośna kreska Groka, łaty i opaska pandy ZCode.
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
  if (sk.ring) {
    const rg = sk.ring;
    x.save(); x.strokeStyle = tone(rg); x.lineWidth = Math.max(1, fw * .07); x.lineCap = 'butt';
    // przerwa od -72° do -27° (prawy górny róg): tam wychodzi kreska, jak w logo
    x.beginPath(); x.ellipse(cx, top + H * .47, fw * .36, H * .36, 0, -Math.PI * .15, Math.PI * 1.6); x.stroke();
    x.restore();
  }
  if (sk.slash) {
    const sl = sk.slash;
    inside(x, fp, () => {
      x.strokeStyle = tone(sl); x.lineWidth = Math.max(1, fw * .07); x.lineCap = 'butt';
      x.beginPath(); x.moveTo(X + fw, top); x.lineTo(X, top + H); x.stroke();
    });
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
