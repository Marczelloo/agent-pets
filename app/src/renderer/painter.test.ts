import { describe, expect, it } from 'vitest';
import { createPet, drawPet, pen, setRng } from './index';
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
    for (const style of STYLE_IDS) for (const motion of ['calm', 'dynamic'] as const) {
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
  it('calm draws exactly like drawPet alone, even after dynamic', () => {
    setRng(seeded(4).next);
    const a = new PetPainter(createPet('clawd', 'edit'));
    a.frame(recorder().ctx, { ...frame, look: { style: 'clean', motion: 'dynamic' } });
    const n = a.pet.fx?.parts.length ?? 0;
    const r = recorder();
    a.frame(r.ctx, { ...frame, t0: 1.1, look: { style: 'clean', motion: 'calm' } });
    const d = recorder();
    drawPet(d.ctx, a.pet, frame.X, frame.Y, frame.u, a.pet.clk, { style: 'clean', motion: 'calm' });
    expect(r.log).toEqual(d.log);
    for (let f = 0; f < 60; f++) a.frame(recorder().ctx, { ...frame, t0: 1.2 + f / 30, look: { style: 'clean', motion: 'calm' } });
    expect(a.pet.fx?.parts.length ?? 0).toBeLessThanOrEqual(n);
  });
  it('an impact inverts the pet for its frame; reduced motion never does', () => {
    for (const reduced of [false, true]) {
      const p = new PetPainter(createPet('clawd', 'idle'));
      p.frame(recorder().ctx, { ...frame, look: { style: 'sticker', motion: 'dynamic' } });
      p.pet.fx.flashReq = 1;
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1.05, reduced, look: { style: 'sticker', motion: 'dynamic' } });
      expect(r.log.includes('filter=invert(1)'), `reduced ${reduced}`).toBe(!reduced);
    }
  });
  it('fast horizontal motion stretches vector and sticker pets, never pixel ones', () => {
    for (const style of ['clean', 'sticker', 'pixel'] as const) {
      const p = new PetPainter(createPet('clawd', 'idle'));
      p.frame(recorder().ctx, { ...frame, look: { style, motion: 'dynamic' } });
      p.pet.p.lx.v = 800;
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1.05, dt: 0.001, look: { style, motion: 'dynamic' } }); // krok prawie zerowy: prędkość zostaje
      const sx = r.log.filter(l => l.startsWith('scale(')).map(l => +l.slice(6, -1).split(',')[0]);
      expect(sx.some(v => v > 1.1), style).toBe(style !== 'pixel');
    }
  });
  it('every model sets a finite face anchor at head height', () => {
    for (const style of ['clean', 'sticker', 'pixel'] as const) for (const skin of ['clawd', 'kodek'] as const) {
      const p = new PetPainter(createPet(skin, 'idle'));
      p.frame(recorder().ctx, { ...frame, look: { style, motion: 'dynamic' } });
      const [fx, fy, gap] = p.pet.face as number[];
      expect([fx, fy, gap].every(Number.isFinite), `${style}/${skin}`).toBe(true);
      expect(fy).toBeLessThan(-20); expect(fy).toBeGreaterThan(-90);
      expect(gap).toBeGreaterThan(4); expect(gap).toBeLessThan(30);
    }
  });
  it('a pet that stops animating (power saving) drops its dynamic particles, words and overlays', () => {
    const p = new PetPainter(createPet('clawd', 'edit'));
    for (let f = 0; f < 60; f++) p.frame(recorder().ctx, { ...frame, t0: 1 + f / 30, look: { style: 'clean', motion: 'dynamic' } });
    expect(p.pet.fx.parts.length).toBeGreaterThan(0);
    const r = recorder();
    p.frame(r.ctx, { ...frame, t0: 3.1, animate: false, look: { style: 'clean', motion: 'dynamic' } });
    expect(p.pet.fx.parts.length + p.pet.fx.words.length).toBe(0);
    const d = recorder();
    drawPet(d.ctx, p.pet, frame.X, frame.Y, frame.u, p.pet.clk, { style: 'clean', motion: 'dynamic' });
    expect(r.log).toEqual(d.log);
  });
});
