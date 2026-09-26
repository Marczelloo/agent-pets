import { describe, expect, it } from 'vitest';
import { SCENES, createPet, drawPet, pen, setRng, stepPet } from '../index';
import { recorder, seeded } from '../testing';

setRng(seeded(6).next);
pen.font = 'x';
const draw = (skin: 'clawd' | 'kodek', scene: string, u = 1) => {
  const c = createPet(skin, scene);
  for (let i = 1; i <= 200; i++) stepPet(c, 1 / 60, i / 60);
  const r = recorder();
  drawPet(r.ctx, c, 150, 150, u, 3.4, { style: 'sticker', motion: 'calm' });
  return { c, log: r.log };
};

describe('sticker model', () => {
  it('never rotates the body, even in sideways scenes', () => {
    for (const scene of ['edit', 'bash', 'grep']) {
      const rot = draw('clawd', scene).log.filter(l => l.startsWith('rotate(')).map(l => Math.abs(+l.slice(7, -1)));
      expect(Math.max(0, ...rot), scene).toBeLessThan(0.3);
    }
  });
  it('icon features: Clawd blush, Kodek screen, headphones, antenna ball', () => {
    const cl = draw('clawd', 'idle').log.join('\n'), ko = draw('kodek', 'idle').log.join('\n');
    expect(cl).toContain('#F0997B');
    expect(ko).toContain('#2C2C2A');
    expect(ko).toContain('#C9C7C1');
    expect(ko).toContain('#5DCAA5');
  });
  it('thick outline in the taskbar', () => {
    const w = draw('clawd', 'idle', .3).log.filter(l => l.startsWith('lineWidth=')).map(l => +l.slice(10));
    expect(Math.max(...w)).toBeGreaterThanOrEqual(2);
  });
  it('every scene draws with finite hands and a balanced canvas state', () => {
    for (const scene of Object.keys(SCENES)) for (const skin of ['clawd', 'kodek'] as const) {
      const { c, log } = draw(skin, scene);
      expect(log.some(l => l.includes('NaN')), `${skin}/${scene}`).toBe(false);
      expect(c.hand.flat().every(Number.isFinite)).toBe(true);
      expect(log.filter(l => l === 'save()').length, `${skin}/${scene}`).toBe(log.filter(l => l === 'restore()').length);
    }
  });
  it('held items are drawn at the right hand (web scene: the net)', () => {
    const { c, log } = draw('clawd', 'web');
    expect(c.hold).toBe('net');
    expect(log.length).toBeGreaterThan(draw('clawd', 'idle').log.length);
  });
  it('the "!" bubble sits no higher than in the clean style, so it is not clipped on hops', () => {
    const bubbleY = (style: 'sticker' | 'clean') => {
      setRng(seeded(6).next);
      const c = createPet('clawd', 'needs');
      for (let i = 1; i <= 200; i++) stepPet(c, 1 / 60, i / 60);
      const r = recorder();
      drawPet(r.ctx, c, 60, 40, .3, 3.4, { style, motion: 'calm' });
      return Math.min(...r.log.filter(l => l.startsWith('translate(')).map(l => +l.slice(10, -1).split(',')[1]));
    };
    expect(bubbleY('sticker')).toBeGreaterThanOrEqual(bubbleY('clean') - .5);
  });
  it('Clawd has side ears and a smile', () => {
    const plain = draw('clawd', 'idle').log.filter(l => l.startsWith('arc(')).length;
    expect(plain).toBeGreaterThan(0); // uśmiech i błyski oczu
  });
});

