import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../../look';
import { createPet, pen, setRng } from '../index';
import { PetPainter } from '../painter';
import { extent, recorder, seeded } from '../testing';
import { SCENES_ANIME } from './index';
import { CAP } from './state';

setRng(seeded(21).next);
pen.font = 'x';
const run = (style: string, skin: 'clawd' | 'kodek', scene: string, o: { saving?: boolean; reduced?: boolean } = {}, secs = 3, fps = 15) => {
  const p = new PetPainter(createPet(skin, scene)), frames: string[][] = [];
  for (let f = 0; f < secs * fps; f++) {
    const r = recorder();
    p.frame(r.ctx, { dt: 1 / fps, t0: 1 + f / fps, X: 60, Y: 40, u: 0.3, animate: true, saving: !!o.saving, reduced: !!o.reduced, dpr: 1, look: { style: style as never, motion: 'anime' } });
    frames.push(r.log);
    expect(p.pet.fx?.parts.length ?? 0, `${style}/${skin}/${scene}`).toBeLessThanOrEqual(o.saving ? CAP / 2 : CAP);
  }
  return { p, frames };
};

describe('anime sweep', () => {
  it('every anime scene in every style and skin: finite, balanced, capped, ≤ 3 impact frames per second', () => {
    for (const scene of Object.keys(SCENES_ANIME)) for (const style of STYLE_IDS) for (const skin of ['clawd', 'kodek'] as const) {
      const { frames } = run(style, skin, scene);
      const tag = `${style}/${skin}/${scene}`;
      frames.forEach(l => {
        expect(l.some(v => v.includes('NaN')), tag).toBe(false);
        expect(l.filter(v => v === 'save()').length, tag).toBe(l.filter(v => v === 'restore()').length);
      });
      const starts = frames.map((l, i) => l.includes('filter=invert(1)') && !(frames[i - 1] ?? []).includes('filter=invert(1)') ? i / 15 : -1).filter(v => v >= 0);
      for (const a of starts) expect(starts.filter(b => b >= a && b < a + 1).length, tag).toBeLessThanOrEqual(3);
    }
  }, 180_000);
  it('power saving halves the particle cap; reduced motion never flashes', () => {
    for (const scene of ['edit', 'done', 'compact', 'grep']) {
      run('clean', 'clawd', scene, { saving: true });
      const { frames } = run('sticker', 'kodek', scene, { reduced: true });
      expect(frames.some(l => l.includes('filter=invert(1)')), scene).toBe(false);
    }
  }, 60_000);
  it('everything stays inside the 48 px taskbar (y ≥ 0) at u = 0.3', () => {
    for (const scene of Object.keys(SCENES_ANIME)) for (const style of ['clean', 'sticker', 'pixel']) for (const skin of ['clawd', 'kodek'] as const) {
      const p = new PetPainter(createPet(skin, scene));
      let top = Infinity, where = '';
      for (let f = 0; f < 60; f++) {
        const e = extent();
        p.frame(e.ctx, { dt: 0.1, t0: 1 + f / 10, X: 60, Y: 40, u: 0.3, animate: true, saving: false, reduced: false, dpr: 1, look: { style: style as never, motion: 'anime' } });
        if (e.top() < top) { top = e.top(); where = `${e.where()} @${f}`; }
      }
      expect(top, `${style}/${skin}/${scene}: ${where}`).toBeGreaterThanOrEqual(-1);
    }
  }, 120_000);
});
