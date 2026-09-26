// Choreografie Dynamiczny scen stanów (spec 8.3). Współrzędne jak w scenes.ts.
import { PI, TAU } from '../math';
import { rng } from '../rng';
import type { Pet } from '../pet';
import type { Scene } from '../scenes';
import { at, every, keys, snapE } from './kit';
import { emit, impact, spray, word } from './state';

/** Twarz zwierzaka z ostatniej klatki modelu (albo środek głowy, gdy jeszcze nie rysowany). */
const faceOf = (c: Pet): number[] => { const f = (c.face as number[]) ?? [0, -45, 12]; return [f[0] + c.p.lx.x, f[1], f[2]]; }; // w miejscu zwierzaka, jak cząsteczki

const THUMB = keys([[0, { ikR: 1, hxR: 20, hyR: -30, lean: -0.3, squint: 0.8, _stiff: 3 }], [0.12, { hxR: 36, hyR: -62, lean: 0.2, squint: 0, happy: 1 }], [1.6, {}]]);

export const STATES: Record<string, Scene> = {
  thinking: { cycle: 1, base: { th: 0, look: 0.3 }, acts: [
    ['cień na oczach', 2.4, (a) => ({ ikL: 1, hxL: -8, hyL: -38, ikR: 1, hxR: 8, hyR: -38, _face: 'shadow', _faceK: snapE(a / 0.4), _bg: 'dark', _bgK: snapE(a / 0.6) })],
    ['dramatyczny uśmiech', 1.6, () => ({ ikL: 1, hxL: -8, hyL: -38, ikR: 1, hxR: 8, hyR: -38, tilt: -0.08, _face: 'shadow', _faceK: 1, _smile: 1, _bg: 'dark' }), (c) => {
      emit(c, 'page', 34, -118, { vx: 8, vy: 12, vr: 1.2, max: 1.6, s: 14 });
    }],
  ] },
  needs: { base: { th: 0, look: 0 }, acts: [
    ['błyszczące oczy', 2.2, () => ({ hopW: 0.6, armR: 2.3, oscR: 0.55, _f: 11, _face: 'sparkle', _faceK: 1, _bang: 1, _shock: 1 })],
    ['puka w szybę', 1.6, (a, _c, t) => ({ hopW: 0, lean: 1, ikR: 1, hxR: 47 + 5 * Math.max(0, Math.sin(t * 16)), hyR: -44, _f: 16, _knock: a > 0.25 ? 1 : 0, _big: 1, _face: 'sparkle', _faceK: 1, _bang: 1 })],
  ] },
  done: { base: { happy: 1, look: -0.3 }, seq: [
    ['Nice!', 1.6, (a) => ({ ...THUMB(a), _thumb: a > 0.1 ? 1 : 0, _face: a > 0.1 ? 'teeth' : null, _faceK: 1, _bg: 'rays', _bgK: snapE(a / 0.3) }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.12)) { impact(c, 1.5); word(c, 'NICE!', 0, -104, 28); spray(c, 'confetti', 16, 0, -70, 190); }
    }],
  ], acts: [
    ['cieszy się', 3, (a) => ({ armL: 2.5 + 0.3 * Math.sin(a * 9), armR: 2.5 - 0.3 * Math.sin(a * 9), hopW: 0.6, happy: 1 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.6)) spray(c, 'confetti', 4, (rng() - 0.5) * 60, -90, 90);
    }],
    ['kciuk znowu', 1.6, (a) => ({ ...THUMB(a), _thumb: a > 0.1 ? 1 : 0, _face: a > 0.1 ? 'teeth' : null, _faceK: 1, _bg: 'rays' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.12)) { word(c, 'NICE!', 0, -104, 28); spray(c, 'confetti', 8, 0, -70, 170); }
    }],
  ] },
  error: { base: { sit: 1, grey: 1 }, acts: [
    ['dusza wylatuje', 3, () => ({ look: 0.6, tilt: 0.12, sleep: 0.5, dizzy: 0.2 }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.1)) { const [fx, fy] = faceOf(c); emit(c, 'soul', fx, fy + 10, { vy: -14, max: 2.6 }); }
      if (every(a, dt, 1.1, 0.4)) { const [fx, fy, gp] = faceOf(c); emit(c, 'tear', fx + gp + 8, fy - 10, { vx: 10, vy: -30 }); }
    }],
    ['wraca do siebie', 1.2, () => ({ shake: 1, dizzy: 0.6 }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0)) { const [fx, fy, gp] = faceOf(c); emit(c, 'tear', fx + gp + 8, fy - 10, { vx: 10, vy: -30 }); }
    }],
  ] },
  idle: { cycle: 1, base: { th: 0.1 }, acts: [
    ['chibi kręci się i nuci', 2.4, (a) => ({ th: a < 0.5 ? TAU * snapE(a / 0.5) : TAU, happy: 0.7, armL: 1.2, armR: 1.2, hopW: a < 0.5 ? 0.4 : 0 }), undefined, undefined, (a, c, _t, dt) => { // nextAct sam zdejmuje pełny obrót z th
      if (a > 0.5 && every(a, dt, 0.35, 0.5)) emit(c, 'note', (rng() - 0.5) * 60, -80, { vx: (rng() - 0.5) * 20, vy: -30 });
    }],
    ['trening: pompki', 2.4, (a) => ({ loaf: 0.45 + 0.45 * Math.sin(a * TAU * 1.25), ikL: 1, hxL: -34, hyL: -4, ikR: 1, hxR: 34, hyR: -4, squint: 0.5, _stiff: 2 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.8, 0.4)) { const [fx, fy, gp] = faceOf(c); emit(c, 'tear', fx - gp - 6, fy - 8, { vx: -15, vy: -25 }); }
    }],
    ['trening: przysiady', 2.4, (a) => ({ sit: 0.45 + 0.45 * Math.sin(a * TAU * 1.25), armL: 1.6, armR: 1.6, squint: 0.4, _stiff: 2 }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.8, 0.4)) spray(c, 'dust', 2, 0, -2, 30, -PI / 2, PI);
    }],
  ] },
  sleep: { cycle: 1, base: { loaf: 1, sleep: 1, dim: 1, th: 0.3, _prop: 'pillow', armL: 0.15, armR: 0.15 }, acts: [
    ['bąbel z nosa', 4, (a) => ({ _snot: 0.5 - 0.5 * Math.cos(a * TAU / 2) })],
    ['dymek snu', 4, (a) => ({ _dream: a })],
  ] },
  compact: { cycle: 1, base: { th: 0, look: 0.3 }, acts: [
    ['dwie kule', 1, (a) => ({ ikL: 1, hxL: -40, hyL: -50, ikR: 1, hxR: 40, hyR: -50, squint: 0.5, _orbs: 1, _bg: 'purple', _bgK: snapE(a / 0.5), _stiff: 2 })],
    ['łączy', 0.6, keys([[0, { ikL: 1, hxL: -40, hyL: -50, ikR: 1, hxR: 40, hyR: -50, _orbs: 1, _bg: 'purple', _stiff: 3 }], [0.15, { hxL: -52, hxR: 52, lean: -0.2 }], [0.35, { hxL: -3, hxR: 3, lean: 0.3 }], [0.6, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.35)) { impact(c, 3); }
    }],
    ['implozja', 0.9, (a) => ({ ikL: 1, hxL: -3, hyL: -50, ikR: 1, hxR: 3, hyR: -50, squint: 0.9, _orbs: 2, _orbK: 1 - a / 0.9, _bg: 'purple' }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.06)) { const an = rng() * TAU; emit(c, 'energy', Math.cos(an) * 40, -50 + Math.sin(an) * 30, { vx: -Math.cos(an) * 70, vy: -Math.sin(an) * 50 }); }
    }],
    ['ociera czoło', 1, (a) => ({ ikL: 1, hxL: -26 + 34 * snapE(a / 0.6), hyL: -64, ikR: 1, hxR: 30, hyR: -34, look: 0.1 }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.5)) emit(c, 'tear', -30, -62, { vx: -25, vy: -20 });
    }],
  ] },
  bye: { base: {}, seq: [
    ['macha na pożegnanie', 0.5, () => ({ th: 0, look: 0, happy: 0.8, armR: 2.3, oscR: 0.55, _f: 11 })],
    ['zamach do biegu', 0.25, () => ({ th: PI / 2, lx: -6, lean: -0.4, squint: 0.8, sit: 0.3, _stiff: 3 })],
    ['ucieczka', 0.35, () => ({ th: PI / 2, lx: 50, walkW: 1, squint: 0.8, _stiff: 3, _bg: 'speed' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0)) { spray(c, 'dust', 8, -6, -2, 60, PI, PI / 2); }
      if (every(a, dt, 0.05)) spray(c, 'dust', 1, c.p.lx.x - 12, -2, 30, PI, PI / 3);
    }],
  ], acts: [['odszedł', 5, () => ({ th: PI / 2, lx: 50, _stiff: 3 })]] }, // ta sama sztywność: bez przestrzelenia przy zmianie w biegu
};
