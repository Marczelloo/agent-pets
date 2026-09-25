import { describe, expect, it } from 'vitest';
import { K } from './pose';
import { SCENES, createPet, drawPet, pen, setRng, setScene, stepPet } from './index';
import { recorder, seeded } from './testing';
import { PetPainter } from './painter';
import { STYLE_IDS } from '../look';

const rng = seeded(11);
setRng(rng.next);
pen.font = 'x';

describe('każda scena i skórka: bez NaN i wyjątków', () => {
  for (const skin of ['clawd', 'kodek'] as const) for (const scene of Object.keys(SCENES)) {
    it(`${skin} / ${scene}`, () => {
      const c = createPet(skin, 'idle');
      setScene(c, scene);
      c.alpha = 0.5;
      const rec = recorder();
      let T = 0;
      for (let f = 0; f < 400; f++) {
        T += 1 / 60;
        pen.boil = Math.floor(T * 8);
        stepPet(c, 1 / 60, T);
        if (f % 10 === 0) drawPet(rec.ctx, c, 60, 40, 0.3, T);
      }
      for (const k of K) expect(Number.isFinite(c.p[k].x), k).toBe(true);
      expect(rec.log.some(l => l.includes('NaN'))).toBe(false);
    });
  }
  it('has the new scenes', () => {
    expect(SCENES).toHaveProperty('compact');
    expect(SCENES).toHaveProperty('bye');
  });
  it('pet alpha scales the whole pet', () => {
    const draw = (alpha?: number) => {
      rng.reset(3);
      const c = createPet('clawd', 'idle');
      if (alpha != null) c.alpha = alpha;
      const rec = recorder();
      drawPet(rec.ctx, c, 60, 40, 1, 0);
      return rec.log.filter(l => l.startsWith('globalAlpha='));
    };
    expect(draw(0.5)).not.toEqual(draw());
    expect(draw(1)).toEqual(draw());
  });
});

describe('każdy styl × ruch × skórka × scena przez PetPainter: bez NaN, stan płótna przywrócony', () => {
  for (const style of STYLE_IDS) for (const motion of ['calm', 'anime'] as const) {
    it(`${style} / ${motion}`, () => {
      for (const skin of ['clawd', 'kodek'] as const) for (const scene of Object.keys(SCENES)) {
        const p = new PetPainter(createPet(skin, scene));
        const rec = recorder();
        for (let f = 0; f < 40; f++) p.frame(rec.ctx, { dt: f % 2 ? 0.05 : 1 / 30, t0: 1 + f / 30, X: 60, Y: 40, u: 0.3, look: { style, motion },
          animate: true, saving: f > 20, reduced: false, dpr: 1 });
        for (const k of K) expect(Number.isFinite(p.pet.p[k].x), `${skin}/${scene}/${k}`).toBe(true);
        expect(rec.log.some(l => l.includes('NaN')), `${skin}/${scene}`).toBe(false);
        expect(rec.log.filter(l => l === 'save()').length).toBe(rec.log.filter(l => l === 'restore()').length);
      }
    });
  }
});
