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

/** Sylwetka Groka-humanoida: zaokrąglona głowa, szyja, szerokie barki i tułów zwężający się do pasa. `R` pominięte. */
export function droidP(X: number, Y: number, W: number, H: number, _R?: number): number[][] {
  if (W < 0) { X += W; W = -W; }
  W = Math.max(W, .01); H = Math.max(H, .01);
  const cx = X + W / 2, p: number[][] = [], n = 5, PI = Math.PI;
  const arc = (ax: number, ay: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([ax + Math.cos(a) * r, ay + Math.sin(a) * r]); }
  };
  // głowa do .4 wysokości, szyja do .46, barki na całą szerokość, pas na .72 szerokości
  const hw = W * .31, hh = H * .4, hr = Math.min(hw, hh) * .6, nw = W * .15, ny = H * .46 + Y, sr = Math.min(W * .14, H * .1), ww = W * .36;
  arc(cx + hw - hr, Y + hr, hr, -PI / 2, 0);
  arc(cx + hw - hr * .5, Y + hh - hr * .5, hr * .5, 0, PI / 2);
  p.push([cx + nw, Y + hh], [cx + nw, ny]);
  arc(X + W - sr, ny + sr, sr, -PI / 2, 0);
  p.push([cx + ww, Y + H], [cx - ww, Y + H]);
  arc(X + sr, ny + sr, sr, PI, PI * 1.5);
  p.push([cx - nw, ny], [cx - nw, Y + hh]);
  arc(cx - hw + hr * .5, Y + hh - hr * .5, hr * .5, PI / 2, PI);
  arc(cx - hw + hr, Y + hr, hr, PI, PI * 1.5);
  return p;
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
 * Znaki na przodzie ciała, po ciele i przed oczami: fasetka Cursora, wizor i logo Groka, łaty i opaska pandy ZCode.
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
    // czarna szyja między głową a barkami
    const d = sk.droid, vw = fw * .5, vy = top + H * .08, vh = H * .26;
    inside(x, fp, () => shp(x, rrP(cx - fw * .16, top + H * .39, fw * .32, H * .08, 0), d.visor, u, { noStroke: 1 }));
    // wizor na głowie
    shp(x, rrP(cx - vw / 2, vy, vw, vh, Math.min(vh * .45, vw / 2)), d.visor, u);
    // odblask na szybie wizora
    x.save(); x.globalAlpha *= .5; shp(x, rrP(cx - vw * .32, vy + vh * .12, vw * .22, vh * .1, vh * .05), '#5A5A5E', u, { noStroke: 1 }); x.restore();
    // logo Groka: pierścień z przerwą w prawym górnym rogu, kreska wychodzi przez przerwę
    const r = Math.min(fw * .12, H * .08);
    x.save(); x.translate(cx, top + H * .66); x.scale(Math.max(.05, co), 1);
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
