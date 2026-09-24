import { describe, expect, it } from 'vitest';
import { clampPct, limitBars, progressFraction } from './hud';

describe('hud', () => {
  it('progressFraction treats missing or empty lists as unknown', () => {
    expect(progressFraction(null)).toBeNull();
    expect(progressFraction({ done: 0, total: 0 })).toBeNull();
    expect(progressFraction({ done: 2, total: 4 })).toBe(0.5);
    expect(progressFraction({ done: 9, total: 4 })).toBe(1);
  });
  it('clampPct keeps 0..100 and survives garbage', () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(140)).toBe(100);
    expect(clampPct(Number.NaN)).toBe(0);
  });
  it('limitBars shows only windows with data, in a fixed order', () => {
    const bars = limitBars([
      { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: null },
      { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: null },
    ]);
    expect(bars).toEqual([
      { agent: 'claude', window: 'five_hour', pct: 34 },
      { agent: 'codex', window: 'weekly', pct: 91 },
    ]);
    expect(limitBars([])).toEqual([]);
  });
});
