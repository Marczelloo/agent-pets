import { describe, expect, it } from 'vitest';
import { hitTest } from './hit';
import { LEFT_REACH, SLOT, type LayoutOut } from './layout';

const out: LayoutOut = { width: 250, pets: [{ id: 'a', x: 50 }, { id: 'b', x: 124 }], hidden: 1, hiddenIds: ['z'],
  badgeX: 2, limitsX: 222 };

describe('hitTest', () => {
  it('finds pets by slot, including props on their right', () => {
    expect(hitTest(out, 50, 30, 48)).toEqual({ kind: 'pet', id: 'a', x: 50 });
    expect(hitTest(out, 50 - LEFT_REACH + SLOT - 1, 30, 48)).toEqual({ kind: 'pet', id: 'a', x: 50 });
    expect(hitTest(out, 124 + 30, 30, 48)).toEqual({ kind: 'pet', id: 'b', x: 124 });
  });
  it('finds the badge and the limits', () => {
    expect(hitTest(out, 10, 24, 48)).toEqual({ kind: 'badge', x: 14 });
    expect(hitTest(out, 230, 24, 48)).toEqual({ kind: 'limits', x: 235 });
  });
  it('misses outside the stage', () => {
    expect(hitTest(out, -1, 24, 48)).toBeNull();
    expect(hitTest(out, 251, 24, 48)).toBeNull();
    expect(hitTest(out, 100, 49, 48)).toBeNull();
  });
});
