import { describe, expect, it } from 'vitest';
import { SPR } from '../renderer/pose';
import { createPet, setRng } from '../renderer';
import { seeded } from '../renderer/testing';
import { MOTIONS } from './index';
import { tick } from './tick';

const rng = seeded(11);
setRng(rng.next);

describe('power saving frame rate', () => {
  it('every spring settles on its target at 10-60 fps in both motions (no random limb jitter)', () => {
    for (const motion of [MOTIONS.calm, MOTIONS.dynamic]) for (const fps of [60, 30, 20, 10]) for (const k of Object.keys(SPR).filter(n => !/^h[xy]/.test(n))) { // hand/eye springs have pose-specific rest values
      rng.reset(1);
      const c = createPet('clawd', 'idle');
      c.act = ['test', 99, () => ({ [k]: 0.35 })]; c.aT = 0;
      let T = 0, top = 0;
      for (let f = 0; f < 3 * fps; f++) { T += 1 / fps; tick(c, 1 / fps, T, motion, true); top = Math.max(top, Math.abs(c.p[k].x)); }
      const label = `${motion.id}/${k}@${fps}`;
      expect(Number.isFinite(top) && top < 0.35 * 1.6, label).toBe(true);
      expect(c.p[k].x, label).toBeCloseTo(0.35, 2);
    }
  });
  it('a pet advanced in 0.1 s frames ends up where a 60 fps one does', () => {
    const end = (fps: number) => { rng.reset(5); const c = createPet('clawd', 'idle'); c.act = ['test', 99, () => ({ armR: 0.5, ikL: 0.3 })]; c.aT = 0;
      let T = 0; for (let f = 0; f < 2 * fps; f++) { T += 1 / fps; tick(c, 1 / fps, T, MOTIONS.calm, true); } return [c.p.armR.x, c.p.ikL.x]; };
    const [a, b] = end(10), [a60, b60] = end(60);
    expect(a).toBeCloseTo(a60, 1); expect(b).toBeCloseTo(b60, 1);
  });
});
