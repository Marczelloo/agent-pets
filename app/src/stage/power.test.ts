import { describe, expect, it } from 'vitest';
import { frameBudget, reducedMotion, stageFps } from './power';

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

describe('stageFps', () => {
  it('keeps the full rate for busy pets and right after a change', () => {
    expect(stageFps(30, ['idle', 'edit'], false)).toBe(30);
    expect(stageFps(30, ['vibe'], false)).toBe(30);
    expect(stageFps(30, ['done'], false)).toBe(30);
    expect(stageFps(30, ['idle'], true)).toBe(30);
    expect(stageFps(30, [], true)).toBe(30);
  });
  it('slows down for calm pets, more for sleepers, most for an empty stage', () => {
    expect(stageFps(30, ['idle', 'sleep'], false)).toBe(20);
    expect(stageFps(30, ['sleep', 'doze'], false)).toBe(10);
    expect(stageFps(30, [], false)).toBe(4);
  });
  it('never goes above the power-saving budget', () => {
    expect(stageFps(10, ['idle'], false)).toBe(10);
    expect(stageFps(10, ['edit'], false)).toBe(10);
    expect(stageFps(10, [], false)).toBe(4);
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
