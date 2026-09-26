import { describe, expect, it } from 'vitest';
import { PREVIEW_GROUPS, nextScene } from './scenes';
import { SCENES } from '../../renderer';
import { en } from '../../i18n/en';
import { pl } from '../../i18n/pl';

describe('preview scenes', () => {
  it('lists every scene exactly once, named in both languages', () => {
    const all = PREVIEW_GROUPS.flatMap(g => g.scenes);
    expect([...all].sort()).toEqual(Object.keys(SCENES).sort());
    for (const k of all) { expect(pl.look.sceneName[k]).toBeTruthy(); expect(en.look.sceneName[k]).toBeTruthy(); }
  });
  it('cycles through all of them and wraps', () => {
    const all = PREVIEW_GROUPS.flatMap(g => g.scenes);
    let k = all[0];
    for (let i = 1; i < all.length; i++) { k = nextScene(k); expect(k).toBe(all[i]); }
    expect(nextScene(k)).toBe(all[0]);
  });
});
