import { describe, expect, it } from 'vitest';
import { createPet, setRng, stepPet } from '../index';
import { seeded } from '../testing';
import { rig } from './rig';

setRng(seeded(2).next);
const SIZE = { w: 98, h: 58, arm: 30 };
const warm = (scene: string, f = 90) => { const c = createPet('clawd', scene); for (let i = 1; i <= f; i++) stepPet(c, 1 / 60, i / 60); return c; };

describe('rig', () => {
  it('hands in c.hand are where the rig draws them', () => {
    const c = warm('edit');
    const r = rig(c, 100, 50, 0.5, 1.5, SIZE);
    expect(c.hand).toEqual(r.arms.map(a => [a.hx / 0.5, a.hy / 0.5]));
    expect(c.aHand).toEqual(r.arms.map(a => [a.ah[0] / 0.5, a.ah[1] / 0.5]));
  });
  it('IK hands follow the scene targets (typing hands sit on the keyboard, right of the body)', () => {
    const c = warm('edit', 240);
    const r = rig(c, 0, 0, 1, 4, SIZE);
    expect(r.arms[1].ik).toBeGreaterThan(0.5);
    expect(r.arms[1].hx).toBeCloseTo(c.p.hxR.x * r.arms[1].ik + r.arms[1].ah[0] * (1 - r.arms[1].ik), 5);
    expect(r.arms[1].hx).toBeGreaterThan(0);
  });
  it('turning the scene sideways sets the face, not a rotation of the body', () => {
    const c = warm('bash', 240);
    const r = rig(c, 0, 0, 1, 4, SIZE);
    expect(r.face).toBe(1);
    expect(Math.abs(r.rot)).toBeLessThan(0.3);
  });
  it('sleeping closes the eyes; values stay finite', () => {
    const sleep = rig(warm('sleep', 400), 0, 0, 1, 6.7, SIZE);
    expect(sleep.eyes.sleep).toBeGreaterThan(0.5);
    expect(sleep.eyes.open).toBeLessThan(0.5);
    const hop = rig(warm('done', 200), 0, 0, 1, 3.3, SIZE);
    for (const v of [hop.oy, hop.sx, hop.sy, hop.rot, ...hop.arms.flatMap(a => [a.hx, a.hy])]) expect(Number.isFinite(v)).toBe(true);
  });
});
