// Choreografie Anime scen stanów (spec 8.3). Współrzędne jak w scenes.ts.
import { rng } from '../rng';
import type { Pet } from '../pet';
import type { Scene } from '../scenes';
import { at, every, keys, snapE } from './kit';
import { emit, impact, spray, word } from './state';

/** Twarz zwierzaka z ostatniej klatki modelu (albo środek głowy, gdy jeszcze nie rysowany). */
const faceOf = (c: Pet): number[] => (c.face as number[]) ?? [0, -45, 12];

const THUMB = keys([[0, { ikR: 1, hxR: 20, hyR: -30, lean: -0.3, squint: 0.8, _stiff: 3 }], [0.12, { hxR: 36, hyR: -62, lean: 0.2, squint: 0, happy: 1 }], [1.6, {}]]);

export const STATES: Record<string, Scene> = {
  thinking: { cycle: 1, base: { th: 0, look: 0.3 }, acts: [
    ['cień na oczach', 2.4, (a) => ({ ikL: 1, hxL: -8, hyL: -38, ikR: 1, hxR: 8, hyR: -38, _face: 'shadow', _faceK: snapE(a / 0.4), _bg: 'dark', _bgK: snapE(a / 0.6) }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.8, 0.4)) word(c, 'ゴゴゴ', rng() < 0.5 ? -44 : 44, -96, 26);
    }],
    ['dramatyczny uśmiech', 1.6, () => ({ ikL: 1, hxL: -8, hyL: -38, ikR: 1, hxR: 8, hyR: -38, tilt: -0.08, _face: 'shadow', _faceK: 1, _smile: 1, _bg: 'dark' }), (c) => {
      emit(c, 'page', 34, -118, { vx: 8, vy: 12, vr: 1.2, max: 1.6, s: 14 });
    }, undefined, (a, c, _t, dt) => { if (at(a, dt, 0.1)) word(c, 'ゴゴゴ', -44, -96, 26); }],
  ] },
  needs: { base: { th: 0, look: 0 }, acts: [
    ['błyszczące oczy', 2.2, () => ({ hopW: 0.6, armR: 2.3, oscR: 0.55, _f: 11, _face: 'sparkle', _faceK: 1, _bang: 1, _shock: 1 })],
    ['puka w szybę', 1.6, (_a, _c, t) => ({ lean: 1, ikR: 1, hxR: 47 + 5 * Math.max(0, Math.sin(t * 16)), hyR: -44, _f: 16, _knock: 1, _big: 1, _face: 'sparkle', _faceK: 1, _bang: 1 })],
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
};
