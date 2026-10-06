import { describe, expect, it } from 'vitest';
import { SCENE_GROUPS, cycleScene, nextScene } from './scenes';
import { backing } from './loop';
import { SCENES } from '../../renderer';
import { en } from '../../i18n/en';
import { pl } from '../../i18n/pl';

describe('preview scenes', () => {
  it('lists every scene exactly once, named in both languages', () => {
    const all = SCENE_GROUPS.flatMap(g => g.scenes);
    expect([...all].sort()).toEqual(Object.keys(SCENES).sort());
    for (const k of all) { expect(pl.look.sceneName[k]).toBeTruthy(); expect(en.look.sceneName[k]).toBeTruthy(); }
  });
  it('has three groups, each with a name in both languages', () => {
    expect(SCENE_GROUPS.map(g => g.id)).toEqual(['work', 'state', 'reactions']);
    for (const g of SCENE_GROUPS) { expect(pl.look.groups[g.id]).toBeTruthy(); expect(en.look.groups[g.id]).toBeTruthy(); expect(g.scenes.length).toBeGreaterThan(0); }
  });
  it('cycles through all of them and wraps', () => {
    const all = SCENE_GROUPS.flatMap(g => g.scenes);
    let k = all[0];
    for (let i = 1; i < all.length; i++) { k = nextScene(k); expect(k).toBe(all[i]); }
    expect(nextScene(k)).toBe(all[0]);
  });
  it('"all in order" does not move on while the window is hidden', () => {
    expect(cycleScene('bash', true)).toBe('bash');
    expect(cycleScene('bash', false)).toBe(nextScene('bash'));
  });
  it('preview canvases use whole device pixels (sharp at 125 % and 150 %)', () => {
    for (const dpr of [1, 1.25, 1.5, 1.75]) for (const css of [150, 187, 230, 460]) {
      const b = backing(css, dpr);
      expect(Math.abs(b.css * dpr - b.px)).toBeLessThan(1e-9);
      expect(Number.isInteger(b.px)).toBe(true);
      expect(Math.abs(b.css - css)).toBeLessThan(1);
    }
  });
});
