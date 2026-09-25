import { describe, expect, it } from 'vitest';
import { createPet, drawPet, pen, setRng } from './index';
import { rrP, shp } from './pen';
import { STYLES } from '../styles';
import { recorder, seeded } from './testing';
import type { StyleId } from '../types';

setRng(seeded(5).next);
pen.font = 'x';

describe('styles', () => {
  it('sketch jitter is visible at taskbar scale (≥ 1.2 px wide, not 0.42)', () => {
    pen.st = STYLES.sketch;
    const rec = recorder();
    let worst = 0;
    for (pen.boil = 0; pen.boil < 20; pen.boil++) {
      rec.log.length = 0;
      shp(rec.ctx, rrP(0, 0, 30, 30, 0), '#fff', 0.3);
      for (const l of rec.log) {
        const m = /^(?:moveTo|lineTo)\(([-\d.]+),([-\d.]+)\)$/.exec(l);
        if (m) worst = Math.max(worst, Math.min(Math.abs(+m[1]), Math.abs(+m[1] - 30)), Math.min(Math.abs(+m[2]), Math.abs(+m[2] - 30)));
      }
    }
    pen.st = STYLES.clean;
    expect(worst).toBeGreaterThan(0.3);
  });
  it('each drawPet sets its own style; nothing leaks to the next pet', () => {
    const a = createPet('clawd', 'idle'), b = createPet('clawd', 'idle');
    const draw = (look?: Parameters<typeof drawPet>[6]) => { const r = recorder(); drawPet(r.ctx, look ? a : b, 50, 50, 0.3, 1, look); return r.log; };
    const plain = draw();
    draw({ style: 'sketch', motion: 'calm' });
    expect(draw()).toEqual(plain);
  });
  const trace = (style: StyleId, skin: 'clawd' | 'kodek' = 'clawd', u = 0.3) => {
    const c = createPet(skin, 'edit');
    const r = recorder();
    drawPet(r.ctx, c, 60, 40, u, 1, { style, motion: 'calm' });
    return r.log;
  };
  it('neon glows in the agent colour and restores the context', () => {
    const log = trace('neon');
    expect(log.some(l => l.startsWith('shadowBlur='))).toBe(true);
    expect(log.filter(l => l === 'save()').length).toBe(log.filter(l => l === 'restore()').length);
  });
  it('ink is greyscale with a black brush outline', () => {
    const log = trace('ink');
    expect(log).toContain('strokeStyle=#111111');
    const fills = log.filter(l => l.startsWith('fillStyle=rgb(')).map(l => l.slice(14, -1).split(',').map(Number));
    expect(fills.length).toBeGreaterThan(0);
    for (const [r, g, b] of fills) expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
  });
  it('arms follow the style too (ink arms are grey, not clay)', () => {
    const log = trace('ink', 'clawd', 1);
    expect(log).not.toContain('strokeStyle=rgb(217,119,87)');
    expect(log.some(l => /^strokeStyle=rgb\((\d+),\1,\1\)$/.test(l))).toBe(true);
  });
  it('neon eyes keep their glow colour instead of the dark fill', () => {
    const log = trace('neon', 'clawd', 1);
    expect(log).not.toContain(`fillStyle=${STYLES.neon.fillFor!(STYLES.neon.ink('#D97757'))}`);
  });
  it('pastel outlines take their fill hue and the shadow is soft', () => {
    const log = trace('pastel');
    expect(log.some(l => l.startsWith('filter=blur('))).toBe(true);
    expect(log).not.toContain('strokeStyle=#2B1D16');
  });
});
