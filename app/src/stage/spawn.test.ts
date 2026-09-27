import { describe, expect, it } from 'vitest';
import { recorder } from '../renderer/testing';
import { drawSpawn, SPAWN_S } from './spawn';

describe('mini pet entrance', () => {
  it('draws a puff or a summoning seal without NaN and with balanced save/restore', () => {
    for (const motion of ['calm', 'dynamic'] as const) for (const pixel of [false, true]) for (const k of [0, 0.3, 0.9]) {
      const r = recorder();
      drawSpawn(r.ctx, 40.3, 40, 0.165, k, motion, pixel, 1.25, '#D97757');
      expect(r.log.join('|'), `${motion} ${pixel} ${k}`).not.toMatch(/NaN|Infinity/);
      expect(r.log.filter(l => l.startsWith('save(')).length).toBe(r.log.filter(l => l.startsWith('restore(')).length);
      expect(r.log.length, `${motion} ${pixel} ${k}`).toBeGreaterThan(2);
    }
  });
  it('pixel art uses only whole device-pixel rectangles', () => {
    for (const dpr of [1, 1.25, 1.5]) for (const motion of ['calm', 'dynamic'] as const) {
      const r = recorder();
      drawSpawn(r.ctx, 40.3, 40, 0.165, 0.4, motion, true, dpr, '#5DCAA5');
      const calls = new Set(r.log.filter(l => /^[a-zA-Z]+\(/.test(l)).map(l => l.slice(0, l.indexOf('('))));
      expect(calls).toEqual(new Set(['save', 'restore', 'fillRect']));
      for (const l of r.log.filter(l => l.startsWith('fillRect('))) for (const v of l.slice(9, -1).split(',').map(Number)) {
        expect(Math.abs(v * dpr - Math.round(v * dpr)), l).toBeLessThan(1e-3);
      }
    }
  });
  it('is over after its time', () => {
    const r = recorder();
    drawSpawn(r.ctx, 40, 40, 0.165, 1, 'calm', false, 1, '#D97757');
    expect(r.log).toEqual([]);
    expect(SPAWN_S).toBeCloseTo(0.6);
  });
});
