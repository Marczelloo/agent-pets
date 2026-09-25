// Model naklejki (spec wyglądu v2, 5): zawsze przodem jak na ikonie aplikacji — okrągłe bryły, gruby kontur,
// krótkie nóżki i łapki-kapsułki; rekwizyty, przedmioty i nakładki wspólne z modelem wektorowym.
import { SKINS } from '../../skins';
import type { Look } from '../../types';
import { PI, TAU, cl, lerpC } from '../math';
import { drawItems } from '../draw/items';
import { drawHeadFx, drawWorldFx } from '../draw/overlay';
import { drawMug, drawPillow, drawProp } from '../draw/props';
import { elP, pen, rrP, seg, shp } from '../pen';
import type { Pet } from '../pet';
import { rig } from './rig';

/** Kształty naklejki w jednostkach u (wzorzec: app-icon.png). */
export const STICKER = {
  clawd: { w: 104, h: 62, r: 20, ears: { w: 14, h: 22, y: .42 }, legs: [-.3, -.1, .1, .3], legW: 11, legH: 12, arm: 26, mitt: 7 },
  kodek: { w: 92, h: 70, r: 30, screen: { m: 10, top: 12, bottom: 16, r: 16 }, phones: { rx: 8, ry: 13 }, antenna: 16, legs: [-.22, .22], legW: 16, legH: 12, arm: 24, mitt: 6.5 },
} as const;

const EYE = '#1E1410', TEAL = '#5DCAA5', SCREEN = '#2C2C2A', PHONE = '#C9C7C1', PHONE_IN = '#A5A298', BLUSH = '#F0997B';

export function drawSticker(x: CanvasRenderingContext2D, c: Pet, X: number, Y: number, u: number, t: number, _look: Look): void {
  const skin = c.type, sk = SKINS[skin], pal = sk.pal, S = STICKER[skin];
  const r = rig(c, X, Y, u, t, { w: S.w, h: S.h, arm: S.arm });
  const tg = c.tg || {}, P = c.p;
  const cm = lerpC(pal.m, pal.g, r.grey), cs = lerpC(pal.s, pal.gs, r.grey);
  const lw = Math.max(2, 2.4 * u * 1.3), GA = r.alpha, { W, H, top } = r;
  const world = () => { x.save(); x.translate(r.XX, Y); x.globalAlpha = GA; x.lineWidth = lw; x.lineJoin = 'round'; x.lineCap = 'round'; x.strokeStyle = pen.ol; };
  const body = () => { world(); x.translate(0, r.oy); x.rotate(r.rot * .5); x.scale(r.sx, r.sy); };

  // cień i poduszka
  world();
  x.save(); x.fillStyle = 'rgba(0,0,0,0.16)'; x.beginPath();
  x.ellipse(0, 0, W * .55 * (1 - r.hopH * .3), Math.max(2, 7 * u) * (1 - r.hopH * .3), 0, 0, TAU); x.fill(); x.restore();
  drawPillow(x, c, u, lw);
  x.restore();

  // nóżki i bryła
  body();
  const legLen = S.legH * u * (1 - r.down);
  if (legLen > 1) S.legs.forEach((lx, i) => {
    const lift = Math.max(0, Math.sin(t * 10 + i * PI)) * 4 * u * r.walk;
    shp(x, rrP(lx * W - S.legW * u / 2, r.bot - 4 * u - lift, S.legW * u, legLen + 4 * u, S.legW * u * .45), cs, u);
  });
  const fx = r.face * 6 * u + r.gaze[0] * u, ey = top + H * .45 + r.gaze[1] * u, e = r.eyes;
  if (skin === 'clawd') {
    const E = STICKER.clawd.ears;
    [-1, 1].forEach(s => shp(x, rrP(s > 0 ? W / 2 - E.w * u * .45 : -W / 2 - E.w * u * .55, top + H * E.y - E.h * u / 2, E.w * u, E.h * u, E.w * u * .4), cm, u));
    shp(x, rrP(-W / 2, top, W, H, S.r * u), cm, u);
    highlight(x, W, top, u);
    [-1, 1].forEach(s => clawdEye(x, fx + s * W * .18, ey, u, e, GA));
    if (e.open > .3 && e.happy < .02) { x.save(); x.lineWidth = Math.max(1.2, 2.2 * u); x.beginPath(); x.arc(fx, ey + 6 * u, 4.5 * u, .15 * PI, .85 * PI); x.stroke(); x.restore(); }
    x.save(); x.globalAlpha = GA * .6; x.fillStyle = BLUSH;
    [-1, 1].forEach(s => { x.beginPath(); x.ellipse(fx + s * W * .3, ey + 8 * u, 6 * u, 3.2 * u, 0, 0, TAU); x.fill(); });
    x.restore();
  } else {
    const K = STICKER.kodek, len = K.antenna * u, ax = Math.sin(c.aa || 0) * len, ay = top - Math.cos(c.aa || 0) * len;
    x.beginPath(); x.moveTo(0, top + 2 * u); x.lineTo(ax, ay); x.stroke();
    shp(x, elP(ax, ay, 4.5 * u, 4.5 * u), r.grey > .5 ? '#E24B4A' : TEAL, u);
    x.save(); x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(ax - 1.4 * u, ay - 1.4 * u, 1.3 * u, 0, TAU); x.fill(); x.restore();
    shp(x, rrP(-W / 2, top, W, H, K.r * u), cm, u);
    highlight(x, W, top, u);
    const m = K.screen.m * u, sy0 = top + K.screen.top * u, sh = H - (K.screen.top + K.screen.bottom) * u;
    shp(x, rrP(-W / 2 + m, sy0, W - 2 * m, sh, K.screen.r * u), SCREEN, u, { raw: 1 });
    [-1, 1].forEach(s => {
      shp(x, elP(s * W / 2, top + H * .5, K.phones.rx * u, K.phones.ry * u), PHONE, u);
      shp(x, elP(s * W / 2, top + H * .5, K.phones.rx * u * .55, K.phones.ry * u * .6), PHONE_IN, u, { noStroke: 1 });
    });
    const tw = cl(P.typeW.x);
    if (tw > .02) {
      x.save(); x.globalAlpha = GA * tw * .8; x.fillStyle = TEAL;
      for (let i = 0; i < 3; i++) x.fillRect(-W / 2 + m + 6 * u, sy0 + sh - (6 + i * 5) * u, (W - 2 * m) * (.25 + .3 * (((i * 7 + Math.floor(t * 3)) % 5) / 5)), 2 * u);
      x.restore();
    }
    [-1, 1].forEach(s => kodekEye(x, fx + s * W * .16, sy0 + sh * .45 + r.gaze[1] * u, u, e, GA));
  }
  x.restore();

  // rekwizyty, łapki, przedmioty, rękawice
  world();
  drawProp(x, c, u, t, lw);
  const thick = S.mitt * 1.6 * u, mr = S.mitt * u;
  r.arms.forEach(a => seg(x, a.sw[0], a.sw[1], a.hx, a.hy, thick, cm, lw));
  drawItems(x, c, r.arms, u, t, lw);
  if (tg._mug) { const R = r.arms[1]; drawMug(x, R.hx - 11 * u * Math.cos(tg._mugRot || 0), R.hy + 6 * u - 11 * u * Math.sin(tg._mugRot || 0), u, tg._mugRot || 0, t, 0); }
  r.arms.forEach(a => shp(x, elP(a.hx, a.hy, mr * (a.s > 0 && tg._big ? 1.3 : 1), mr * .9), cm, u));
  x.restore();

  // nakładki nad głową i w świecie
  body(); drawHeadFx(x, c, u, t, top, W / 2, GA); x.restore();
  world(); drawWorldFx(x, c, r.arms, u, lw, GA); x.restore();
}

/** Refleks u góry bryły (jak na ikonie). */
function highlight(x: CanvasRenderingContext2D, W: number, top: number, u: number) {
  x.save(); x.globalAlpha *= .45;
  shp(x, rrP(-W * .34, top + 5 * u, W * .68, 5 * u, 2.5 * u), '#FFFFFF', u, { noStroke: 1, raw: 1 });
  x.restore();
}

type Eyes = { open: number; blink: number; sleep: number; happy: number; dizzy: number; squint: number };

function clawdEye(x: CanvasRenderingContext2D, ex: number, ey: number, u: number, e: Eyes, GA: number) {
  x.save(); x.fillStyle = EYE; x.strokeStyle = EYE; x.lineWidth = Math.max(1.2, 2.4 * u);
  if (e.open > .02) {
    shp(x, elP(ex, ey, 4.2 * u, Math.max(.4, 6.5 * u * e.open)), EYE, u, { noStroke: 1, raw: 1 });
    x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(ex + 1.4 * u, ey - 2.4 * u * e.open, 1.6 * u * e.open, 0, TAU); x.fill();
  }
  lids(x, ex, ey, u, e, GA);
  x.restore();
}

function kodekEye(x: CanvasRenderingContext2D, ex: number, ey: number, u: number, e: Eyes, GA: number) {
  x.save(); x.fillStyle = TEAL; x.strokeStyle = TEAL; x.lineWidth = Math.max(1.2, 2.6 * u);
  if (e.open > .02) shp(x, rrP(ex - 3 * u, ey - 5 * u * e.open, 6 * u, Math.max(.5, 10 * u * e.open), 3 * u), TEAL, u, { noStroke: 1, raw: 1 });
  lids(x, ex, ey, u, e, GA);
  x.restore();
}

/** Sen, radość („^^”), zawroty i zmrużenie: kreski w kolorze oka. */
function lids(x: CanvasRenderingContext2D, ex: number, ey: number, u: number, e: Eyes, GA: number) {
  if (e.sleep > .02) { x.globalAlpha = GA * e.sleep; x.beginPath(); x.arc(ex, ey - 2 * u, 4.5 * u, .15 * PI, .85 * PI); x.stroke(); }
  if (e.happy > .02) { x.globalAlpha = GA * e.happy; x.beginPath(); x.arc(ex, ey + 4 * u, 4.5 * u, 1.15 * PI, 1.85 * PI); x.stroke(); }
  if (e.dizzy > .02) { x.globalAlpha = GA * e.dizzy; const k = 4 * u; x.beginPath(); x.moveTo(ex - k, ey - k); x.lineTo(ex + k, ey + k); x.moveTo(ex + k, ey - k); x.lineTo(ex - k, ey + k); x.stroke(); }
  if (e.squint > .05) { x.globalAlpha = GA * e.squint; x.beginPath(); x.moveTo(ex - 4 * u, ey); x.lineTo(ex + 4 * u, ey); x.stroke(); }
}
