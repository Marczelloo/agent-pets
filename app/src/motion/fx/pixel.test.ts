import { describe, expect, it } from 'vitest';
import { createPet, setRng } from '../../renderer';
import { WORDS } from '../../renderer/dynamic/kit';
import { PHYS, emit, fxState, word, type PKind } from '../../renderer/dynamic/state';
import { recorder, seeded } from '../../renderer/testing';
import { GLYPHS } from './glyphs';
import type { FxCtx } from './index';
import { pixelBack, pixelFront } from './pixel';

setRng(seeded(2).next);
const ENV = { fx: true, bg: true, flash: true, shake: true, parts: 1 };
const G = (dpr: number, o: Partial<FxCtx> = {}): FxCtx => ({ X: 61.3, Y: 40.2, u: 0.3, t: 1.37, dpr, env: ENV, model: 'pixel', flash: false, accent: '#D97757', alpha: 1, ...o });
const TGS: Record<string, unknown>[] = [
  { _bg: 'speed' }, { _bg: 'rays' }, { _bg: 'purple' }, { _bg: 'wind' }, { _ground: 'seal' }, { _ground: 'circle', _groundK: 0.6 },
  { _face: 'glasses' }, { _face: 'sparkle' }, { _face: 'teeth' },
  { _barrage: 1 }, { _lens: 1 }, { _orbit: 1 }, { _orbit: 1, _idea: 1 }, { _orbs: 1 }, { _orbs: 2, _orbK: 0.4 }, { _thumb: 1 }, { _shock: 1 }, { _bang: 1 }, { _snot: 0.7 }, { _dream: 2 },
];
const pet = (tg: Record<string, unknown>) => {
  const c = createPet('clawd', 'idle'); c.tg = { ...c.tg, ...tg }; c.face = [1.3, -44.7, 12.2]; c.hand = [[-31.4, -29.6], [29.2, -33.3]]; fxState(c);
  for (const k of Object.keys(PHYS) as PKind[]) emit(c, k, 10.3, -40.7, { life: 0.13 });
  for (const w of WORDS) word(c, w, 3.3, -91.1);
  c.fx.trail = [[[-10, -60, 1.2], [10, -40, 1.3], [30, -30, 1.37]], []];
  return c;
};

describe('pixel dynamic effects', () => {
  it('only integer device-pixel rectangles for every effect at 100/125/150 %', () => {
    for (const dpr of [1, 1.25, 1.5]) for (const tg of TGS) for (const flash of [false, true]) {
      const r = recorder(), c = pet(tg);
      pixelBack(r.ctx, c, G(dpr, { flash })); pixelFront(r.ctx, c, G(dpr, { flash }));
      const tag = `${JSON.stringify(tg)}@${dpr}`;
      expect(r.log.some(l => /^(moveTo|lineTo|arc|ellipse|quadraticCurveTo|fillText|strokeText|drawImage|stroke|fill)\(/.test(l)), tag).toBe(false);
      expect(r.log.some(l => l.startsWith('fillRect(')), tag).toBe(true);
      for (const l of r.log.filter(v => v.startsWith('fillRect('))) for (const v of l.slice(9, -1).split(',').map(Number))
        expect(Math.abs(v * dpr - Math.round(v * dpr)), `${tag}: ${l}`).toBeLessThan(2e-3);
      expect(r.log.filter(l => l === 'save()').length).toBe(r.log.filter(l => l === 'restore()').length);
    }
  });
  it('the bitmap font has every character the scenes use, 7 rows each', () => {
    for (const w of WORDS) for (const ch of w) { expect(GLYPHS[ch], ch).toBeDefined(); expect(GLYPHS[ch].length).toBe(7); }
  });
  it('onomatopoeia are at least 9 device px tall in the taskbar', () => {
    const c = createPet('clawd', 'idle'); fxState(c); word(c, 'バン', 0, -90);
    const r = recorder(); pixelFront(r.ctx, c, G(1));
    const ys = r.log.filter(l => l.startsWith('fillRect(')).map(l => l.slice(9, -1).split(',').map(Number)).map(v => [v[1], v[1] + v[3]]);
    expect(Math.max(...ys.map(v => v[1])) - Math.min(...ys.map(v => v[0]))).toBeGreaterThanOrEqual(9);
  });
  it('onomatopoeia keep the vector size in the big preview (glyph pixel follows u, not the grid cell)', () => {
    const c = createPet('clawd', 'idle'); fxState(c); word(c, 'バン', 0, -90);
    const r = recorder(); pixelFront(r.ctx, c, G(1, { u: 0.8 }));
    const ys = r.log.filter(l => l.startsWith('fillRect(')).map(l => l.slice(9, -1).split(',').map(Number));
    const h = Math.max(...ys.map(v => v[1] + v[3])) - Math.min(...ys.map(v => v[1]));
    expect(h).toBeLessThanOrEqual(30 * 0.8 * 1.3);
    expect(h).toBeGreaterThanOrEqual(30 * 0.8 * 0.7);
  });
  it('power saving skips the action background on the grid too', () => {
    const r = recorder(); pixelBack(r.ctx, pet({ _bg: 'speed' }), G(1, { env: { ...ENV, bg: false } }));
    expect(r.log).toEqual([]);
  });
  it('particles stay where they were emitted in the slot, not dragged by the dashing pet', () => {
    const c = createPet('clawd', 'idle'); fxState(c); c.p.lx.x = 40; emit(c, 'dust', 10, -40, { life: 0.01 });
    const r = recorder(); pixelFront(r.ctx, c, G(1));
    const xs = r.log.filter(l => l.startsWith('fillRect(')).map(l => +l.slice(9).split(',')[0]);
    expect(Math.min(...xs)).toBeGreaterThan(58); expect(Math.max(...xs)).toBeLessThan(68);
  });
});
