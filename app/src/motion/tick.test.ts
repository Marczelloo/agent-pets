import { describe, expect, it } from 'vitest';
import { K } from '../renderer/pose';
import { SCENES, createPet, setRng, stepPet } from '../renderer';
import { seeded } from '../renderer/testing';
import { MOTIONS, effective } from './index';
import { tick } from './tick';

const rng = seeded(3);
setRng(rng.next);

describe('motion', () => {
  it('calm tick = the old stepPet with the global clock', () => {
    // każdy zwierzak liczony osobno od tego samego ziarna (stepPet losuje akcje i mrugnięcia)
    rng.reset(3); const a = createPet('clawd', 'edit');
    let T = 0;
    for (let f = 0; f < 120; f++) { T += 1 / 60; stepPet(a, 1 / 60, T + 0.5); }
    rng.reset(3); const b = createPet('clawd', 'edit');
    T = 0;
    for (let f = 0; f < 120; f++) { T += 1 / 60; tick(b, 1 / 60, T + 0.5, MOTIONS.calm, true); }
    for (const k of K) expect(b.p[k].x).toBeCloseTo(a.p[k].x, 9);
  });
  it('anime runs the pet clock faster and stays finite at 10 fps in every scene', () => {
    for (const scene of Object.keys(SCENES)) {
      const c = createPet('kodek', scene);
      let T = 0;
      for (let f = 0; f < 200; f++) { T += 0.05; tick(c, 0.05, T, MOTIONS.anime, true); }
      for (const k of K) expect(Number.isFinite(c.p[k].x) && Math.abs(c.p[k].x) < 1e4, `${scene}/${k}`).toBe(true);
      expect(c.clk).toBeCloseTo(0.05 + 199 * 0.05 * 1.4, 6);
    }
  });
  it('switching motion keeps the clock continuous', () => {
    const c = createPet('clawd', 'idle');
    tick(c, 0.1, 5, MOTIONS.calm, true);
    const before = c.clk;
    tick(c, 0.1, 5.1, MOTIONS.anime, true);
    expect(c.clk - before).toBeCloseTo(0.14, 9);
  });
  it('anime springs overshoot where calm ones do not jump as far', () => {
    const peak = (m: typeof MOTIONS.calm) => { rng.reset(9); const c = createPet('clawd', 'idle'); let T = 0, top = 0;
      c.p.armR.x = 0; for (let f = 0; f < 60; f++) { T += 1 / 60; tick(c, 1 / 60, T, m, true); top = Math.max(top, c.p.armR.x); } return top; };
    expect(peak(MOTIONS.anime)).not.toBeCloseTo(peak(MOTIONS.calm), 3);
  });
  it('saving and reduced motion switch the costly effects off', () => {
    expect(effective(MOTIONS.anime, { saving: true, reduced: false })).toMatchObject({ trails: false, speedLines: false, impacts: true, emotes: true });
    expect(effective(MOTIONS.anime, { saving: false, reduced: true })).toMatchObject({ trails: false, speedLines: false, impacts: false });
  });
});
