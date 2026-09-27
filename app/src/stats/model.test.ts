import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { agentName, badgeText, formatChange, formatHours, formatPct, formatTokens, scanPct } from './model';
import { countUp } from './count';

afterEach(() => setLang('pl'));

describe('stats model', () => {
  it('formats token counts compactly in Polish and English', () => {
    setLang('pl');
    expect([950, 12_400, 12_000, 48_200_000, 1_300_000_000].map(formatTokens)).toEqual(['950', '12,4 tys.', '12 tys.', '48,2 mln', '1,3 mld']);
    setLang('en');
    expect([950, 12_400, 48_200_000, 1_300_000_000].map(formatTokens)).toEqual(['950', '12.4K', '48.2M', '1.3B']);
  });
  it('formats work time, percentages and changes', () => {
    expect([76_620_000, 2_700_000, 0].map(formatHours)).toEqual(['21 h 17 min', '45 min', '0 min']);
    expect(formatPct(91.4)).toBe('91%');
    expect([formatChange(12.2), formatChange(-5), formatChange(null)]).toEqual(['▲ 12%', '▼ 5%', null]);
  });
  it('names agents and badges', () => {
    expect(['claude', 'codex', 'router'].map(a => agentName(a as never))).toEqual(['Claude Code', 'Codex', 'Agent Router']);
    expect(badgeText('cache_master')).toBe('Mistrz cache');
  });
  it('turns scan progress into a percentage', () => {
    expect(scanPct({ files: 3, scanned: 50, total: 200, done: false })).toBe(25);
    expect(scanPct({ files: 0, scanned: 0, total: 0, done: true })).toBe(100);
    expect(scanPct({ files: 1, scanned: 150, total: 100, done: false }), 'files grew during the pass').toBe(100);
  });
});

describe('countUp', () => {
  it('starts at zero, ends exactly on the value and eases out', () => {
    expect(countUp(1000, 0)).toBe(0);
    expect(countUp(1000, 800)).toBe(1000);
    expect(countUp(1000, 5000)).toBe(1000);
    expect(countUp(1000, 400)).toBeGreaterThan(500);
  });
  it('jumps to the value when motion is reduced', () => {
    expect(countUp(1000, 0, 800, true)).toBe(1000);
  });
});
