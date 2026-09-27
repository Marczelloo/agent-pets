import { describe, expect, it } from 'vitest';
import { arrange } from './arrange';

const spans = (items: { x: number; w: number }[], out: { left: number; row: 0 | 1 }[]) =>
  out.map((o, i) => ({ row: o.row, l: o.left, r: o.left + items[i].w }));

describe('arrange bubbles', () => {
  it('centres a lone bubble over its pet', () => {
    expect(arrange([{ x: 100, w: 60 }], 400)).toEqual([{ left: 70, row: 0 }]);
  });

  it('two bubbles over neighbouring pets do not overlap', () => {
    const items = [{ x: 100, w: 120 }, { x: 150, w: 120 }];
    const [a, b] = spans(items, arrange(items, 600));
    expect(a.row).toBe(0);
    expect(b.row === a.row ? b.l >= a.r + 6 : true).toBe(true);
  });

  it('three too wide for one row stack into a second row', () => {
    const items = [{ x: 100, w: 150 }, { x: 150, w: 150 }, { x: 200, w: 150 }];
    const out = spans(items, arrange(items, 330));
    expect(out.some(o => o.row === 1)).toBe(true);
    for (const row of [0, 1]) {
      const r = out.filter(o => o.row === row).sort((p, q) => p.l - q.l);
      for (let i = 1; i < r.length; i++) expect(r[i].l).toBeGreaterThanOrEqual(r[i - 1].r);
    }
  });

  it('nothing sticks out of the window', () => {
    const items = [{ x: 5, w: 100 }, { x: 395, w: 100 }, { x: 200, w: 300 }];
    for (const o of spans(items, arrange(items, 400))) {
      expect(o.l).toBeGreaterThanOrEqual(0);
      expect(o.r).toBeLessThanOrEqual(400);
    }
  });

  it('keeps the input order in the result', () => {
    const out = arrange([{ x: 300, w: 50 }, { x: 50, w: 50 }], 400);
    expect(out[0].left).toBeGreaterThan(out[1].left);
  });
});
