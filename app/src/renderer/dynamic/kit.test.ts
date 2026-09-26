import { describe, expect, it } from 'vitest';
import { SCENES } from '../scenes';
import { SCENES_DYNAMIC } from './index';
import { WORDS, at, every, keys, snapE } from './kit';
import { simulate } from '../testing';

describe('dynamic kit', () => {
  it('scenes say only the few climax words (no Japanese text): BAM!, POOF!, NICE!, "!"', () => {
    for (const scene of Object.keys(SCENES_DYNAMIC)) {
      const c = simulate('clawd', scene, 9);
      const words = Object.keys(c.fx?.stats ?? {}).filter(k => k.startsWith('word:')).map(k => k.slice(5));
      for (const w of words) expect(WORDS as readonly string[], `${scene}: ${w}`).toContain(w);
    }
    expect([...WORDS]).toEqual(['BAM!', 'POOF!', 'NICE!', '!']);
  });
  it('SCENES_DYNAMIC covers exactly the calm scene keys', () => {
    expect(Object.keys(SCENES_DYNAMIC).sort()).toEqual(Object.keys(SCENES).sort());
  });
  it('snapE covers most of the way early, then holds', () => {
    expect(snapE(0)).toBe(0);
    expect(snapE(0.3)).toBeGreaterThan(0.8);
    expect(snapE(1)).toBe(1);
  });
  it('keys carries missing keys forward, snaps numbers and switches strings when heading for the key', () => {
    const f = keys([[0, { hxR: 0, _hold: 'a' }], [0.1, { hxR: 10 }], [0.2, { _hold: 'b' }]]);
    expect(f(0).hxR).toBe(0);
    expect(f(0.03).hxR as number).toBeGreaterThan(8);
    expect(f(0.15)).toEqual({ hxR: 10, _hold: 'b' });
    expect(f(0.5)).toEqual({ hxR: 10, _hold: 'b' });
  });
  it('at fires once when the act time passes the mark, also at 10 fps', () => {
    for (const dt of [1 / 60, 0.1]) {
      let n = 0;
      for (let a = 0; a < 1; a += dt) if (at(a, dt, 0.35)) n++;
      expect(n, `dt ${dt}`).toBe(1);
    }
  });
  it('every fires once per period from the start, without doubling at coarse steps', () => {
    for (const dt of [1 / 60, 0.1]) {
      let n = 0;
      for (let i = 0; i * dt < 2 - 1e-9; i++) if (every(i * dt, dt, 0.5)) n++;
      expect(n, `dt ${dt}`).toBe(4);
    }
  });
});
