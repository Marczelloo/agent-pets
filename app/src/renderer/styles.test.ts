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
  it('sticker: at least 2 px outline in the taskbar and gradient fills', () => {
    const log = trace('sticker');
    const widths = log.filter(l => l.startsWith('lineWidth=')).map(l => +l.slice(10));
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(2);
    expect(log.some(l => l.startsWith('createLinearGradient('))).toBe(true);
  });
  it('sticker: Clawd smiles and blushes, Kodek wears headphones', () => {
    expect(trace('sticker', 'clawd', 1).length).toBeGreaterThan(trace('clean', 'clawd', 1).length);
    const k = trace('sticker', 'kodek', 1).join('\n');
    expect(k).toContain('#E8E6E0');
  });
});
