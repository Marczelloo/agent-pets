import { describe, expect, it } from 'vitest';
import { createPet, pen, setRng } from './index';
import { PetPainter, type SurfaceFactory } from './painter';
import { recorder, seeded } from './testing';
import { STYLE_IDS } from '../look';

setRng(seeded(4).next);
pen.font = 'x';
const fake: SurfaceFactory = (w, h) => ({ canvas: { width: w, height: h } as HTMLCanvasElement, ctx: recorder().ctx });
const frame = { dt: 1 / 30, t0: 1, X: 60, Y: 40, u: 0.3, animate: true, saving: false, reduced: false, dpr: 1 };

describe('PetPainter', () => {
  it('draws straight onto the stage for vector styles in calm motion', () => {
    const r = recorder();
    new PetPainter(createPet('clawd', 'edit'), fake).frame(r.ctx, { ...frame, look: { style: 'clean', motion: 'calm' } });
    expect(r.log.some(l => l.startsWith('drawImage('))).toBe(false);
    expect(r.log.some(l => l.startsWith('lineTo('))).toBe(true);
  });
  it('pixel art draws a small layer scaled up without smoothing', () => {
    const r = recorder();
    new PetPainter(createPet('clawd', 'edit'), fake).frame(r.ctx, { ...frame, look: { style: 'pixel', motion: 'calm' } });
    expect(r.log).toContain('imageSmoothingEnabled=false');
    expect(r.log.find(l => l.startsWith('drawImage('))).toBeDefined();
  });
  it('pixel art hardens the layer edges (alpha threshold), so pixels stay crisp', () => {
    const layers: ReturnType<typeof recorder>[] = [];
    const px = new Uint8ClampedArray([10, 20, 30, 40, 10, 20, 30, 200]);
    const grab: SurfaceFactory = (w, h) => {
      const r = recorder();
      layers.push(r);
      (r.ctx as unknown as { getImageData: () => unknown }).getImageData = () => ({ data: px });
      return { canvas: { width: w, height: h } as HTMLCanvasElement, ctx: r.ctx };
    };
    new PetPainter(createPet('clawd', 'edit'), grab).frame(recorder().ctx, { ...frame, look: { style: 'pixel', motion: 'calm' } });
    expect([px[3], px[7]]).toEqual([0, 255]);
    expect(layers[0].log.some(l => l.startsWith('putImageData('))).toBe(true);
  });
  it('typing in anime is fast enough for trails', () => {
    const p = new PetPainter(createPet('clawd', 'edit'), fake);
    let ghosts = 0;
    for (let f = 0; f < 90; f++) {
      const r = recorder();
      p.frame(r.ctx, { ...frame, dt: 1 / 60, t0: 1 + f / 60, look: { style: 'clean', motion: 'anime' } });
      if (f > 30 && r.log.filter(l => l.startsWith('drawImage(')).length > 1) ghosts++;
    }
    expect(ghosts).toBeGreaterThan(20);
  });
  it('trails show earlier frames only while the pet moves fast', () => {
    const p = new PetPainter(createPet('clawd', 'bash'), fake);
    const look = { style: 'clean' as const, motion: 'anime' as const };
    let ghosts = 0;
    for (let f = 0; f < 60; f++) {
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1 + f / 30, look });
      if (r.log.filter(l => l.startsWith('drawImage(')).length > 1) ghosts++;
    }
    expect(ghosts).toBeGreaterThan(0);
    const still = new PetPainter(createPet('clawd', 'sleep'), fake);
    for (let f = 0; f < 30; f++) { const r = recorder(); still.frame(r.ctx, { ...frame, t0: 1 + f / 30, look }); if (f > 10) expect(r.log.filter(l => l.startsWith('drawImage(')).length).toBe(1); }
  });
  it('power saving draws anime without trails', () => {
    const p = new PetPainter(createPet('clawd', 'bash'), fake);
    for (let f = 0; f < 30; f++) {
      const r = recorder();
      p.frame(r.ctx, { ...frame, t0: 1 + f / 30, saving: true, look: { style: 'clean', motion: 'anime' } });
      expect(r.log.some(l => l.startsWith('drawImage('))).toBe(false);
    }
  });
  it('every pair of styles draws differently at taskbar scale', () => {
    const logs = STYLE_IDS.map(style => {
      const r = recorder();
      setRng(seeded(4).next);
      new PetPainter(createPet('clawd', 'edit'), fake).frame(r.ctx, { ...frame, look: { style, motion: 'calm' } });
      return r.log.join('\n');
    });
    for (let i = 0; i < logs.length; i++) for (let j = i + 1; j < logs.length; j++) expect(logs[i], `${STYLE_IDS[i]} vs ${STYLE_IDS[j]}`).not.toBe(logs[j]);
  });
});
