import { describe, expect, it } from 'vitest';
import { createPet, pen, setRng } from '../../renderer';
import { PHYS, emit, fxState, word, type PKind } from '../../renderer/dynamic/state';
import { recorder, seeded } from '../../renderer/testing';
import type { FxCtx } from './index';
import { SLOT, vectorBack, vectorFront } from './vector';

setRng(seeded(2).next);
pen.font = 'x';
const ENV = { fx: true, bg: true, flash: true, shake: true, parts: 1 };
const G = (o: Partial<FxCtx> = {}): FxCtx => ({ X: 60, Y: 40, u: 0.3, t: 1, dpr: 1, env: ENV, model: 'vector', flash: false, glow: 0, accent: '#D97757', alpha: 1, ...o });
const pet = (tg: Record<string, unknown> = {}) => { const c = createPet('clawd', 'idle'); c.tg = { ...c.tg, ...tg }; c.face = [0, -45, 12]; c.hand = [[-30, -30], [30, -30]]; fxState(c); return c; };
const ok = (log: string[]) => { expect(log.some(l => l.includes('NaN'))).toBe(false); expect(log.filter(l => l === 'save()').length).toBe(log.filter(l => l === 'restore()').length); };

describe('vector dynamic effects', () => {
  it('every particle kind draws finite and balanced', () => {
    for (const k of Object.keys(PHYS) as PKind[]) {
      const c = pet(); emit(c, k, 10, -40, { vx: 30, vy: -20, life: 0.1 });
      const r = recorder(); vectorFront(r.ctx, c, G());
      expect(r.log.length, k).toBeGreaterThan(3); ok(r.log);
    }
  });
  it('onomatopoeia are at least 9 px in the taskbar', () => {
    const c = pet(); word(c, 'ドドド', 0, -90);
    const r = recorder(); vectorFront(r.ctx, c, G());
    const px = r.log.filter(l => l.startsWith('font=')).map(l => parseFloat(l.split(' ')[1]));
    expect(px.length).toBeGreaterThan(0);
    expect(Math.min(...px)).toBeGreaterThanOrEqual(9);
  });
  it('the action background is clipped to the pet slot and skipped in power saving', () => {
    for (const bg of ['speed', 'rays', 'purple', 'wind']) {
      const r = recorder(); vectorBack(r.ctx, pet({ _bg: bg }), G());
      expect(SLOT).toEqual({ w: 150, h: 145 });
      expect(r.log, bg).toContain('rect(37.5,-0.5,45,43.5)'); // 150u × 145u wokół podstawy (60, 40) przy u = 0,3
      expect(r.log).toContain('clip()'); ok(r.log);
      const s = recorder(); vectorBack(s.ctx, pet({ _bg: bg }), G({ env: { ...ENV, bg: false } }));
      expect(s.log, bg).toEqual([]);
    }
  });
  it('an impact frame puts a white disc and radial lines behind the pet', () => {
    const r = recorder(); vectorBack(r.ctx, pet(), G({ flash: true }));
    expect(r.log).toContain('fillStyle=#FFFFFF');
    expect(r.log.filter(l => l.startsWith('moveTo(')).length).toBeGreaterThanOrEqual(12);
  });
  it('a fading flash draws the white disc at its strength, without the inverted frame', () => {
    const r = recorder(); vectorBack(r.ctx, pet(), G({ glow: 0.5 }));
    expect(r.log).toContain('fillStyle=#FFFFFF');
    expect(r.log).toContain('globalAlpha=0.5');
    const n = recorder(); vectorBack(n.ctx, pet(), G({ glow: 0 }));
    expect(n.log).toEqual([]);
  });
  it('ground seals draw under the pet in their colour', () => {
    const r = recorder(); vectorBack(r.ctx, pet({ _ground: 'circle', _groundK: 1 }), G());
    expect(r.log.some(l => l.startsWith('ellipse('))).toBe(true); ok(r.log);
  });
  it('the thinking orbit carries three symbols around the head, big enough for the taskbar', () => {
    const r = recorder(); vectorFront(r.ctx, pet({ _orbit: 1 }), G());
    expect(r.log.filter(l => l.startsWith('fillText(?')).length).toBe(1);
    expect(r.log.filter(l => l.startsWith('arc(')).length).toBeGreaterThanOrEqual(3); // trybik (i otwór) + żarówka
    const fonts = r.log.filter(l => l.startsWith('font=')).map(l => parseFloat(l.split(' ')[1]));
    expect(Math.min(...fonts)).toBeGreaterThanOrEqual(9);
  });
  it('the big magnifier sits at the right hand and shows magnified code inside its glass', () => {
    const r = recorder(); vectorFront(r.ctx, pet({ _lens: 1 }), G());
    const arcs = r.log.filter(l => l.startsWith('arc(')).map(l => l.slice(4, -1).split(',').map(Number));
    const glass = arcs.find(a => a[2] >= 14 * 0.3 - 1e-6)!;
    expect(glass).toBeDefined();
    expect(Math.hypot(glass[0] - (60 + 30 * 0.3), glass[1] - (40 - 30 * 0.3))).toBeLessThan(25 * 0.3); // przy prawej dłoni (30, −30)
    expect(r.log).toContain('clip()');
    expect(r.log.filter(l => l.startsWith('fillRect(')).length).toBeGreaterThanOrEqual(3); // linie kodu w szkle
  });
  it('face overlays sit at the face anchor', () => {
    for (const face of ['glasses', 'sparkle', 'teeth']) {
      const r = recorder(); vectorFront(r.ctx, pet({ _face: face, _faceK: 1 }), G());
      const xs = r.log.filter(l => /^(arc|ellipse|moveTo|rect|fillRect)\(/.test(l)).map(l => +l.slice(l.indexOf('(') + 1).split(',')[0]);
      expect(xs.length, face).toBeGreaterThan(0);
      for (const v of xs) expect(Math.abs(v - 60), face).toBeLessThan(40 * 0.3 + 12);
      ok(r.log);
    }
  });
  it('a fast hand leaves a smear, a still one does not', () => {
    const still = pet(); still.fx.trail = [[[30, -30, 0.9], [30, -30, 1]], []];
    const a = recorder(); vectorFront(a.ctx, still, G());
    const fast = pet(); fast.fx.trail = [[[-10, -60, 0.9], [10, -40, 0.95], [30, -30, 1]], []];
    const b = recorder(); vectorFront(b.ctx, fast, G());
    expect(b.log.length).toBeGreaterThan(a.log.length);
    expect(b.log.some(l => l.startsWith('closePath('))).toBe(true);
  });
  it('a barrage fans at least 4 fists per hand', () => {
    const r = recorder(); vectorFront(r.ctx, pet({ _barrage: 1 }), G());
    expect(r.log.filter(l => l.startsWith('arc(')).length).toBeGreaterThanOrEqual(8);
  });
  it('orbs, thumb, shock lines, bouncing "!", snot bubble, dream bubble, thinking orbit and idea bulb all draw', () => {
    for (const tg of [{ _orbit: 1 }, { _orbit: 1, _idea: 1 }, { _orbs: 1 }, { _orbs: 2, _orbK: 0.5 }, { _thumb: 1 }, { _shock: 1 }, { _bang: 1 }, { _snot: 0.8 }, { _dream: 1.2 }]) {
      const r = recorder(); vectorFront(r.ctx, pet(tg), G());
      expect(r.log.length, JSON.stringify(tg)).toBeGreaterThan(3); ok(r.log);
    }
  });
  it('particles and words stay where they were emitted in the slot: a dashing pet does not drag them along', () => {
    const c = pet(); c.p.lx.x = 40; emit(c, 'spark', 10, -40, { life: 0.01 }); word(c, 'シュッ', 10, -80);
    const r = recorder(); vectorFront(r.ctx, c, G());
    const xs = r.log.filter(l => l.startsWith('translate(')).map(l => +l.slice(10).split(',')[0]); // cząsteczka rysowana po translate(px, py)
    expect(xs).toEqual([63]);
    const tx = r.log.filter(l => l.startsWith('fillText(')).map(l => +l.split(',')[1]);
    expect(tx).toEqual([63]);
  });
  it('the ground seal fits inside the slot clip (its bottom is not cut flat)', () => {
    const r = recorder(); vectorBack(r.ctx, pet({ _ground: 'seal', _groundK: 1 }), G());
    const [, cy, , h] = r.log.find(l => l.startsWith('rect('))!.slice(5, -1).split(',').map(Number);
    const bottoms = r.log.filter(l => l.startsWith('ellipse(')).map(l => { const a = l.slice(8, -1).split(',').map(Number); return a[1] + a[3]; });
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(cy + h);
  });
});
