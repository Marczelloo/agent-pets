import { describe, expect, it } from 'vitest';
import { createPet, drawPet, pen, setRng, setScene, stepPet } from '../renderer';
import { recorder, seeded } from '../renderer/testing';
import { MOTIONS } from './index';
import { drawFx } from './fx';

setRng(seeded(8).next);
pen.font = 'x';
const warm = (scene: string) => { const c = createPet('clawd', scene); for (let f = 0; f < 60; f++) stepPet(c, 1 / 60, f / 60);
  drawPet(recorder().ctx, c, 60, 40, 0.3, 1); return c; };

describe('anime fx', () => {
  it('draws nothing in calm motion', () => {
    const r = recorder();
    drawFx(r.ctx, warm('edit'), 60, 40, 0.3, 1, MOTIONS.calm, 999);
    expect(r.log).toEqual([]);
  });
  it('typing gets speed lines', () => {
    const r = recorder();
    drawFx(r.ctx, warm('edit'), 60, 40, 0.3, 1, MOTIONS.anime, 100);
    expect(r.log.filter(l => l.startsWith('lineTo(')).length).toBeGreaterThanOrEqual(4);
  });
  it('an error gets a sweat drop and an anger mark; waiting gets a big "!"', () => {
    const e = recorder(); drawFx(e.ctx, warm('error'), 60, 40, 0.3, 1, MOTIONS.anime, 0);
    expect(e.log.some(l => l.startsWith('quadraticCurveTo('))).toBe(true);
    expect(e.log).toContain('strokeStyle=#E24B4A');
    const n = recorder(); drawFx(n.ctx, warm('needs'), 60, 40, 0.3, 1, MOTIONS.anime, 0);
    expect(n.log.some(l => l.startsWith('fillText(!,'))).toBe(true);
  });
  it('finishing bursts once, briefly', () => {
    const c = warm('edit');
    drawFx(recorder().ctx, c, 60, 40, 0.3, 1, MOTIONS.anime, 0);
    setScene(c, 'done');
    const a = recorder(); drawFx(a.ctx, c, 60, 40, 0.3, 1.02, MOTIONS.anime, 0);
    const b = recorder(); drawFx(b.ctx, c, 60, 40, 0.3, 1.5, MOTIONS.anime, 0);
    const rays = (l: string[]) => l.filter(v => v.startsWith('moveTo(')).length;
    expect(rays(a.log)).toBeGreaterThanOrEqual(8);
    expect(rays(b.log)).toBeLessThan(8);
  });
  it('without speed lines and impacts (power saving) only emotes remain', () => {
    const r = recorder();
    drawFx(r.ctx, warm('edit'), 60, 40, 0.3, 1, { ...MOTIONS.anime, speedLines: false, impacts: false }, 100);
    expect(r.log).toEqual([]);
  });
});
