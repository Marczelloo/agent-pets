// Choreografie Anime scen pracy (spec 8.3). Współrzędne w jednostkach mózgu jak w scenes.ts: podstawa (0, 0),
// y w górę ujemny, klawiatura biurka ≈ (−2…18, −30), ekran terminala ≈ (70…100, −60).
import { PI, hr } from '../math';
import { rng } from '../rng';
import type { Scene } from '../scenes';
import { HIP, at, every, keys, snapE } from './kit';
import { emit, impact, spray, word } from './state';

const PUNCH = 1 / 14;
const kx = (i: number, k: number) => (i ? 18 : -2) + 8 * (hr(k * 1.37 + i) - 0.5);

/** Seria ORA/MUDA: pięści na przemian w klawiaturę, 14 ciosów na sekundę zegara zwierzaka. */
const barrage = (_a: number, _c: unknown, t: number) => {
  const k = Math.floor(t / PUNCH), p = (t / PUNCH) % 1, left = k % 2 === 0;
  const down = p < 0.5 ? snapE(p * 2) : 1 - snapE((p - 0.5) * 2);
  return { ikL: 1, ikR: 1, hxL: kx(0, k), hyL: left ? -46 + 16 * down : -44, hxR: kx(1, k), hyR: left ? -44 : -46 + 16 * down,
    typeW: 1, lean: 0.25, squint: 0.6, look: 0.4, _barrage: 1, _bg: 'speed', _stiff: 3 };
};
const FINAL = keys([
  [0, { ikL: 1, hxL: -2, hyL: -40, ikR: 1, hxR: 18, hyR: -44, lean: 0.2, squint: 0.6, tilt: 0, _stiff: 3 }],
  [0.14, { hxR: 34, hyR: -84, lean: -0.35, tilt: -0.08 }],
  [0.2, { hxR: 12, hyR: -29, lean: 0.7, tilt: 0.1 }],
  [0.75, {}],
  [1, { hxR: 18, hyR: -34, lean: 0.2, tilt: 0 }],
]);

const SEALS = keys([
  [0, { ikL: 1, ikR: 1, hxL: -8, hyL: -38, hxR: 8, hyR: -38, _stiff: 3 }],
  [0.1, { hxL: -3, hyL: -44, hxR: 3, hyR: -44 }], [0.3, {}],
  [0.4, { hxL: -6, hyL: -52, hxR: 6, hyR: -36 }], [0.6, {}],
  [0.7, { hxL: 2, hyL: -40, hxR: 10, hyR: -48 }], [0.9, {}],
  [1.0, { hxL: -10, hyL: -34, hxR: -2, hyR: -46 }], [1.2, {}],
  [1.3, { hxL: -2, hyL: -56, hxR: 2, hyR: -56 }], [1.6, {}],
]);
const SEAL_AT = [0.1, 0.4, 0.7, 1.0, 1.3];

const SHEET = { ikL: 1, hxL: -22, hyL: -19, ikR: 1, hxR: 22, hyR: -19 };
const FLICK = keys([[0, { ...SHEET }], [0.1, { hxR: 14, hyR: -24 }], [0.16, { hxR: 40, hyR: -40 }], [0.45, {}], [0.6, { hxR: 22, hyR: -19 }]]);

export const WORK: Record<string, Scene> = {
  edit: { cycle: 1, base: { th: 0.3, look: 0.2, ex: 0.75, _prop: 'desk' }, acts: [
    ['seria ORA', 3.2, barrage, undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, PUNCH)) {
        const P = c.p, left = Math.floor(a / PUNCH) % 2 === 0, hx = left ? P.hxL.x : P.hxR.x;
        emit(c, 'key', hx, -32, { vx: (rng() - 0.5) * 140, vy: -150 - rng() * 90, vr: (rng() - 0.5) * 20 });
        if (rng() < 0.5) spray(c, 'spark', 1, hx, -30, 90);
      }
      if (every(a, dt, 0.7)) word(c, 'ドドド', -34 + rng() * 20, -104);
    }],
    ['finałowy cios', 1, (a) => ({ ...FINAL(a), typeW: 1, _bg: a > 0.18 && a < 0.5 ? 'speed' : null }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.2)) { impact(c, 3); spray(c, 'spark', 10, 12, -30, 160); spray(c, 'key', 4, 12, -30, 180); word(c, 'バン', 34, -96); }
    }],
  ] },
  bash: { cycle: 1, base: { th: 0.55, look: -0.1, ex: 0.8, _prop: 'crt' }, acts: [
    ['pieczęcie rąk', 1.6, (a) => ({ ...SEALS(a), squint: 0.5, _scr: 'type', _prog: a / 1.6 }), undefined, undefined, (a, c, _t, dt) => {
      for (const s of SEAL_AT) if (at(a, dt, s)) spray(c, 'spark', 3, (c.p.hxL.x + c.p.hxR.x) / 2, (c.p.hyL.x + c.p.hyR.x) / 2 - 4, 110);
    }],
    ['puf!', 0.5, keys([[0, { ...HIP, ikR: 1, hxR: 2, hyR: -56, _stiff: 3 }], [0.08, { hxR: 64, hyR: -52, lean: 0.4 }], [0.5, {}]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.08)) { spray(c, 'smoke', 8, 84, -60, 60, -PI / 2, 2 * PI); word(c, 'ボン', 84, -104); impact(c, 1.5, false); }
    }],
    ['komenda działa', 1.8, (a) => ({ ...HIP, ikR: 1, hxR: 68, hyR: -47, look: -0.4, ex: 0.85, _scr: 'run', _run: a, _prog: 1 })],
  ] },
  read: { cycle: 1, base: { th: 0.12, look: 0.85, tilt: -0.06, _hold: 'sheet' }, acts: [
    ['czyta z błyskiem okularów', 3, (a) => ({ ...SHEET, hyL: -19 + Math.sin(a * 1.7), hyR: -19 + Math.sin(a * 1.7 + 0.4), ex: -0.8 + 1.6 * ((a / 1.3) % 1), _face: 'glasses', _faceK: 1, _bg: 'wind' }), undefined, undefined, (a, c, _t, dt) => {
      if (every(a, dt, 0.9, 0.3)) emit(c, 'page', 30, -30, { vx: 160 + rng() * 60, vy: -60 - rng() * 40, vr: 6 });
    }],
    ['przerzuca stronę', 0.6, (a) => ({ ...FLICK(a), _face: 'glasses', _faceK: 1, _bg: 'wind' }), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.16)) for (let i = 0; i < 3; i++) emit(c, 'page', 34, -36, { vx: 180 + i * 40, vy: -90 + i * 20, vr: 8 });
    }],
  ] },
  grep: { cycle: 1, base: { th: 0.45, tilt: 0.04, _prop: 'board' }, acts: [
    ['Sharingan: skanuje', 2.6, (a) => ({ ...HIP, ikR: 1, hxR: 40, hyR: -40, ex: 0.9, look: -0.2, squint: 0.3, _face: 'sharingan', _faceK: snapE(a / 0.15), _scan: (a * 1.6) % 1, _bg: 'dark', _bgK: snapE(a / 0.3) })],
    ['trafienie!', 1, keys([[0, { ...HIP, ikR: 1, hxR: 40, hyR: -40, armL: 0.35, hopW: 0, _face: 'sharingan', _faceK: 1, _stiff: 3 }], [0.06, { hxR: 74, hyR: -58, hopW: 0.8, lean: 0.4 }], [0.6, { hopW: 0 }], [1, { hxR: 40, hyR: -40, lean: 0 }]]), undefined, undefined, (a, c, _t, dt) => {
      if (at(a, dt, 0.06)) { impact(c, 2.5); word(c, '!', 30, -100, 40); spray(c, 'spark', 6, 74, -58, 120); }
    }],
  ] },
};
