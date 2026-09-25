import { describe, expect, it } from 'vitest';
import { createPet, pen, setRng } from './index';
import { PetPainter } from './painter';
import { recorder, seeded } from './testing';
import { STYLE_IDS } from '../look';

setRng(seeded(4).next);
pen.font = 'x';
const frame = { dt: 1 / 30, t0: 1, X: 60, Y: 40, u: 0.3, animate: true, saving: false, reduced: false, dpr: 1 };

describe('PetPainter', () => {
  it('draws straight onto the stage for vector styles in calm motion', () => {
    const r = recorder();
    new PetPainter(createPet('clawd', 'edit')).frame(r.ctx, { ...frame, look: { style: 'clean', motion: 'calm' } });
    expect(r.log.some(l => l.startsWith('lineTo('))).toBe(true);
  });
  it('never draws earlier frames (no ghosts) and never uses an offscreen layer, in any style or motion', () => {
    for (const style of STYLE_IDS) for (const motion of ['calm', 'anime'] as const) {
      const p = new PetPainter(createPet('clawd', 'bash'));
      for (let f = 0; f < 30; f++) {
        const r = recorder();
        p.frame(r.ctx, { ...frame, t0: 1 + f / 30, look: { style, motion } });
        expect(r.log.some(l => l.startsWith('drawImage(')), `${style}/${motion}`).toBe(false);
      }
    }
  });
  it('switching style mid-flight keeps the pet going', () => {
    const p = new PetPainter(createPet('kodek', 'edit'));
    const styles = ['clean', 'sticker', 'pixel', 'sketch', 'sticker', 'clean'] as const;
    styles.forEach((style, f) => {
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1 + f / 30, look: { style, motion: 'calm' } });
      expect(r.log.some(l => l.includes('NaN')), style).toBe(false);
    });
    expect(p.pet.hand.every((h: number[]) => h.every(Number.isFinite))).toBe(true);
  });
  it('every pair of styles draws differently at taskbar scale', () => {
    const logs = STYLE_IDS.map(style => {
      const r = recorder();
      setRng(seeded(4).next);
      new PetPainter(createPet('clawd', 'edit')).frame(r.ctx, { ...frame, look: { style, motion: 'calm' } });
      return r.log.join('\n');
    });
    for (let i = 0; i < logs.length; i++) for (let j = i + 1; j < logs.length; j++) expect(logs[i], `${STYLE_IDS[i]} vs ${STYLE_IDS[j]}`).not.toBe(logs[j]);
  });
});
