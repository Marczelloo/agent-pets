import { describe, expect, it } from 'vitest';
import { K } from '../pose';
import { SCENES, createPet, drawPet, pen, setRng, stepPet } from '../index';
import { SCENES_DYNAMIC } from '../dynamic';
import { recorder, seeded } from '../testing';
import { STYLE_IDS } from '../../look';
import { WEAR, drawWear } from './wear';

setRng(seeded(9).next);
pen.font = 'x';

const NEW = ['podium_first', 'podium_second', 'podium_third', 'run'];

describe('statistics scenes and worn items', () => {
  it('the podium and run scenes exist in calm and dynamic motion', () => {
    for (const s of NEW) {
      expect(SCENES[s], s).toBeDefined();
      expect(SCENES_DYNAMIC[s], s).toBeDefined();
    }
  });
  it('the new scenes run 240 frames without NaN for both skins', () => {
    for (const skin of ['clawd', 'kodek'] as const) for (const s of NEW) {
      const c = createPet(skin, s);
      for (let f = 1; f <= 240; f++) stepPet(c, 1 / 60, f / 60);
      for (const k of K) expect(Number.isFinite(c.p[k].x), `${skin}/${s}/${k}`).toBe(true);
    }
  });
  it('the second place claps: both hands meet in front', () => {
    const c = createPet('clawd', 'podium_second');
    let closest = Infinity;
    for (let f = 1; f <= 120; f++) { stepPet(c, 1 / 60, f / 60); closest = Math.min(closest, Math.abs(c.tg.hxR - c.tg.hxL)); }
    expect(closest).toBeLessThan(12);
  });
  it('every worn item draws in every style without NaN', () => {
    for (const kind of WEAR) for (const style of STYLE_IDS) for (const skin of ['clawd', 'kodek'] as const) {
      const c = createPet(skin, 'idle');
      c.wear = kind;
      for (let f = 1; f <= 30; f++) stepPet(c, 1 / 60, f / 60);
      const r = recorder();
      drawPet(r.ctx, c, 60, 40, 0.3, 1, { style, motion: 'calm' });
      expect(r.log.join('\n'), `${kind}/${style}/${skin}`).not.toMatch(/NaN|Infinity/);
    }
  });
  it('a worn item adds drawing, and without it nothing changes', () => {
    const draw = (wear?: string) => {
      setRng(seeded(9).next);
      const c = createPet('clawd', 'idle');
      if (wear) c.wear = wear;
      const r = recorder();
      drawPet(r.ctx, c, 60, 40, 0.3, 1, { style: 'clean', motion: 'calm' });
      return r.log;
    };
    const plain = draw();
    expect(draw()).toEqual(plain);
    for (const w of WEAR) expect(draw(w).length, w).toBeGreaterThan(plain.length);
  });
  it('drawWear alone stays within the anchor width', () => {
    for (const kind of WEAR) {
      const r = recorder();
      drawWear(r.ctx, kind, { x: 0, top: -50, w: 40, h: 40, rot: 0 }, 1, 2);
      const xs = r.log.flatMap(l => /^(?:moveTo|lineTo|quadraticCurveTo|bezierCurveTo|arc|ellipse|rect|fillRect)\(([-\d.]+)/.exec(l)?.[1] ?? []).map(Number);
      expect(xs.length, kind).toBeGreaterThan(0);
      for (const v of xs) expect(Math.abs(v), `${kind} ${v}`).toBeLessThanOrEqual(34);
    }
  });
});
