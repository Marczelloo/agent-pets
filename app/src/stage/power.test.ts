import { describe, expect, it } from 'vitest';
import { frameBudget, reducedMotion } from './power';

describe('frameBudget', () => {
  it('draws at 30 fps and animates everyone normally', () => {
    const b = frameBudget(false);
    expect(b.fps).toBe(30);
    expect(['idle', 'sleep', 'done', 'working'].every(s => b.animate(s as never))).toBe(true);
  });
  it('saves power: 10 fps and only busy pets move', () => {
    const b = frameBudget(true);
    expect(b.fps).toBe(10);
    expect(b.animate('working')).toBe(true);
    expect(b.animate('needs_you')).toBe(true);
    expect(['idle', 'sleep', 'done'].some(s => b.animate(s as never))).toBe(false);
  });
});

describe('reducedMotion', () => {
  it('follows the media query and is off without matchMedia', () => {
    expect(reducedMotion()).toBe(false);
    const g = globalThis as unknown as { matchMedia?: (q: string) => { matches: boolean } };
    g.matchMedia = q => ({ matches: q.includes('reduce') });
    expect(reducedMotion()).toBe(true);
    delete g.matchMedia;
  });
});
