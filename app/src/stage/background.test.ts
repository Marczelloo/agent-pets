import { describe, expect, it } from 'vitest';
import { bgStyle, bgVisible } from './background';

describe('stage background', () => {
  it('none draws nothing but leaves display to the classes (the Move frame must still show)', () => {
    const s = bgStyle({ kind: 'none', radius: 12 }, false);
    expect(s.display).toBeUndefined();
    expect(s.background).toBe('transparent');
    expect(s.border).toBe('none');
    expect(bgVisible({ kind: 'none', radius: 12 })).toBe(false);
    expect(bgVisible({ kind: 'glass', radius: 12 })).toBe(true);
  });
  it('glass follows the taskbar: white tint on a dark bar, black on a light one, border 1.5x stronger', () => {
    const dark = bgStyle({ kind: 'glass', radius: 10 }, false);
    expect(dark.background).toBe('rgba(255,255,255,0.12)');
    expect(dark.display).toBeUndefined();
    expect(dark.border).toBe('1px solid rgba(255,255,255,0.18)');
    expect(dark.borderRadius).toBe('10px');
    expect(bgStyle({ kind: 'glass', radius: 10 }, true).background).toBe('rgba(0,0,0,0.12)');
  });
  it('glass with a chosen colour and a border that never exceeds full opacity', () => {
    const s = bgStyle({ kind: 'glass', color: '#336699', opacity: 80, radius: 0 }, true);
    expect(s.background).toBe('rgba(51,102,153,0.8)');
    expect(s.border).toBe('1px solid rgba(51,102,153,1)');
  });
  it('solid uses its colour at 90 % by default and has no border', () => {
    const s = bgStyle({ kind: 'solid', color: '#2D3A4F', radius: 6 }, false);
    expect(s.background).toBe('rgba(45,58,79,0.9)');
    expect(s.border).toBe('none');
    expect(bgStyle({ kind: 'solid', radius: 6 }, true).background).toBe('rgba(255,255,255,0.9)');
  });
});
