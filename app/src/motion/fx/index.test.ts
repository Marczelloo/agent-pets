import { describe, expect, it } from 'vitest';
import { createPet } from '../../renderer';
import { fxState } from '../../renderer/dynamic/state';
import { FLASH_MAX, TRAIL_S, flashFrame, recordTrail, shakeOffset, stretchOf } from './index';

const ENV = { fx: true, bg: true, flash: true, shake: true, parts: 1 };

describe('dynamic frame composition', () => {
  it('at most 3 flashes start in any second', () => {
    const s = fxState(createPet('clawd', 'edit'));
    const starts: number[] = [];
    let prev = false;
    for (let f = 0; f < 300; f++) { // 5 s przy 60 kl./s, prośba co klatkę
      s.flashReq = 1;
      const on = flashFrame(s, f / 60, ENV);
      if (on && !prev) starts.push(f / 60);
      prev = on;
    }
    for (const a of starts) expect(starts.filter(b => b >= a && b < a + 1).length).toBeLessThanOrEqual(FLASH_MAX);
    expect(starts.length).toBeGreaterThanOrEqual(12);
  });
  it('an impact frame stays visible for at least 120 ms, also at 10 fps', () => {
    const at = (fps: number) => { const s = fxState(createPet('clawd', 'edit')); s.flashReq = 1; const on: boolean[] = [];
      for (let f = 0; f < fps; f++) on.push(flashFrame(s, 5 + f / fps, ENV)); return on; };
    expect(at(10).slice(0, 3)).toEqual([true, true, false]);
    const sixty = at(60);
    expect(sixty.slice(0, 7).every(Boolean)).toBe(true);
    expect(sixty.slice(8).some(Boolean)).toBe(false);
  });
  it('reduced motion: no flash, no shake', () => {
    const s = fxState(createPet('clawd', 'edit'));
    const env = { ...ENV, flash: false, shake: false };
    s.flashReq = 1;
    expect(flashFrame(s, 1, env)).toBe(false);
    s.shakeAt = 1; s.shakeAmp = 4;
    expect(shakeOffset(s, 1.03, env, 0.3, 0)).toEqual([0, 0]);
  });
  it('the shake decays within 0.3 s and snaps to the pixel grid', () => {
    const s = fxState(createPet('clawd', 'edit'));
    s.shakeAt = 1; s.shakeAmp = 4;
    const [dx] = shakeOffset(s, 1.02, ENV, 1, 0);
    expect(Math.abs(dx)).toBeGreaterThan(0.5);
    expect(shakeOffset(s, 1.4, ENV, 1, 0)).toEqual([0, 0]);
    const [px, py] = shakeOffset(s, 1.02, ENV, 1, 2);
    expect(px % 2).toBe(0); expect(py % 2).toBe(0);
  });
  it('the body stretches only in fast horizontal motion', () => {
    const c = createPet('clawd', 'idle');
    c.p.lx.v = 0; expect(stretchOf(c)).toBe(0);
    c.p.lx.v = 600; expect(stretchOf(c)).toBeGreaterThan(0.2);
    c.p.lx.v = 5000; expect(stretchOf(c)).toBeLessThanOrEqual(0.3);
  });
  it('the hand trail keeps only the last 0.12 s', () => {
    const c = createPet('clawd', 'idle'), s = fxState(c);
    for (let f = 0; f < 30; f++) { c.hand = [[f, 0], [-f, 0]]; recordTrail(s, c, f / 60); }
    expect(s.trail[0].every(p => 29 / 60 - p[2] <= TRAIL_S + 1e-9)).toBe(true);
    expect(s.trail[0].at(-1)).toEqual([29, 0, 29 / 60]);
  });
});
