import { describe, expect, it } from 'vitest';
import type { Session } from '../types';
import { actionLabel, badgeTooltip, formatAgo, formatReset, limitsTooltip, petTooltip } from './text';

const base: Session = {
  id: 's', agent: 'claude', origin: 'cli', title: 'Widżet w pasku', cwd: 'C:\\work\\agent-pets', state: 'working',
  tool: 'bash', progress: { done: 2, total: 5 }, context: { used: 50_000, max: 200_000 }, started_at: 0,
  last_activity: 100_000, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: 's', cwd: '', app: null },
};

describe('petTooltip', () => {
  it('shows title, agent, action, progress, context and quiet time', () => {
    expect(petTooltip(base, 220_000)).toEqual({
      title: 'Widżet w pasku',
      subtitle: 'Claude Code · CLI',
      lines: ['Uruchamia komendy', 'Zadania: 2/5', 'Kontekst: 25%', 'Ostatnia aktywność: 2 min temu'],
    });
  });
  it('falls back to the folder name, then to a placeholder', () => {
    expect(petTooltip({ ...base, title: '' }, 100_000).title).toBe('agent-pets');
    expect(petTooltip({ ...base, title: '', cwd: '' }, 100_000).title).toBe('Sesja bez tytułu');
  });
  it('cuts prompt-long titles to 80 characters', () => {
    const t = petTooltip({ ...base, title: 'x'.repeat(200) }, 100_000).title;
    expect(t).toHaveLength(80);
    expect(t.endsWith('…')).toBe(true);
  });
  it('skips context with max 0 and progress with total 0', () => {
    const lines = petTooltip({ ...base, context: { used: 5, max: 0 }, progress: { done: 0, total: 0 } }, 100_000).lines;
    expect(lines.some(l => l.startsWith('Kontekst'))).toBe(false);
    expect(lines.some(l => l.startsWith('Zadania'))).toBe(false);
  });
  it('names origins and unknown values safely', () => {
    expect(petTooltip({ ...base, agent: 'codex', origin: 'router' }, 0).subtitle).toBe('Codex · Agent Router');
    expect(actionLabel({ state: 'paused' as never, tool: null })).toBe('Pracuje');
  });
});

describe('formatting', () => {
  it('formatAgo', () => {
    expect(formatAgo(3_000)).toBe('teraz');
    expect(formatAgo(42_000)).toBe('42 s temu');
    expect(formatAgo(7 * 60_000)).toBe('7 min temu');
    expect(formatAgo(3 * 3_600_000 + 5)).toBe('3 h temu');
  });
  it('formatReset uses local time, a weekday beyond 24 h, and handles the past', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    expect(formatReset(new Date(2026, 8, 24, 17, 5).getTime(), now)).toBe('reset 17:05');
    expect(formatReset(new Date(2026, 8, 26, 9, 0).getTime(), now)).toBe('reset sob 09:00');
    expect(formatReset(now - 1, now)).toBe('reset wkrótce');
    expect(formatReset(null, now)).toBe('');
  });
  it('limitsTooltip clamps and orders', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    const t = limitsTooltip([
      { agent: 'codex', window: 'weekly', used_pct: 140, resets_at: null },
      { agent: 'claude', window: 'five_hour', used_pct: 34.4, resets_at: new Date(2026, 8, 24, 17, 5).getTime() },
    ], now);
    expect(t.title).toBe('Limity');
    expect(t.lines).toEqual(['Claude · 5h: 34% · reset 17:05', 'Codex · tydzień: 100%']);
  });
  it('badgeTooltip lists hidden sessions', () => {
    const t = badgeTooltip([base, { ...base, id: 'b', title: 'Druga' }]);
    expect(t.title).toBe('Jeszcze 2 sesje');
    expect(t.lines).toEqual(['Widżet w pasku · Uruchamia komendy', 'Druga · Uruchamia komendy']);
  });
});

describe('actionLabel with music', () => {
  it('says the pet is idle and what plays, so dancing never looks like work', () => {
    const m = { playing: true, app: 'Spotify.exe' };
    expect(actionLabel({ state: 'idle', tool: null }, m)).toBe('Bezczynny · gra Spotify');
    expect(actionLabel({ state: 'sleep', tool: null }, { playing: true, app: '308046B0AF4A39CB' })).toBe('Śpi · gra muzyka');
    expect(actionLabel({ state: 'idle', tool: null }, { playing: false, app: null })).toBe('Bezczynny');
    expect(actionLabel({ state: 'working', tool: 'bash' }, m)).toBe(actionLabel({ state: 'working', tool: 'bash' }));
    expect(actionLabel({ state: 'done', tool: null }, m)).toBe(actionLabel({ state: 'done', tool: null }));
  });
});
