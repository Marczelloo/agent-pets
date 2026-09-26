import { describe, expect, it } from 'vitest';
import type { Session, State } from '../types';
import { CHILD_DONE_MS, childrenOf, contextText, hasInactive, limitRows, panelSessions, progressText, sessionSubtitle } from './model';

const s = (id: string, state: State, last: number): Session => ({
  id, agent: 'claude', origin: 'cli', title: id, cwd: 'C:\\work\\' + id, state, tool: null, progress: null, context: null,
  started_at: 0, last_activity: last, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: id, cwd: '', app: null },
});

describe('panel model', () => {
  it('puts sessions that need you first, then the most recently active', () => {
    const out = panelSessions([s('a', 'working', 10), s('b', 'needs_you', 1), s('c', 'idle', 30), s('d', 'error', 2)]);
    expect(out.map(x => x.id)).toEqual(['d', 'b', 'c', 'a']);
  });
  it('always shows four limit rows and never invents 0%', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    const rows = limitRows([{ agent: 'codex', window: 'weekly', used_pct: 91, resets_at: null }], now);
    expect(rows.map(r => `${r.agent}/${r.window}`)).toEqual(['claude/five_hour', 'claude/weekly', 'codex/five_hour', 'codex/weekly']);
    expect(rows[0].pct).toBeNull();
    expect(rows[3].pct).toBe(91);
  });
  it('shows the reset time when it is known', () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    const rows = limitRows([{ agent: 'claude', window: 'five_hour', used_pct: 40, resets_at: now + 2 * 3_600_000 }], now);
    expect(rows[0].reset).toBe('reset 14:00');
  });
  it('describes a session', () => {
    const x = { ...s('a', 'working', 0), tool: 'bash' as const, origin: 'desktop' as const, progress: { done: 2, total: 5 }, context: { used: 50, max: 200 } };
    expect(sessionSubtitle(x)).toBe('Claude Code · aplikacja · a');
    expect(progressText(x)).toBe('2/5');
    expect(contextText(x)).toBe('25%');
    expect(progressText({ ...x, progress: { done: 0, total: 0 } })).toBeNull();
    expect(contextText({ ...x, context: { used: 1, max: 0 } })).toBeNull();
  });
  it('inactive means idle, done, asleep or ended, like the core', () => {
    expect(hasInactive([s('a', 'working', 0), s('b', 'needs_you', 0), s('c', 'error', 0)])).toBe(false);
    for (const st of ['idle', 'done', 'sleep', 'ended'] as State[]) expect(hasInactive([s('a', st, 0)])).toBe(true);
  });
  it('children stay under their parent, oldest first, and finished ones leave after 10 s', () => {
    const kid = (id: string, started: number, over: Partial<Session> = {}): Session => ({ ...s(id, 'working', 5), parent: 'p', started_at: started, ...over });
    const all = [s('p', 'working', 1), kid('b', 20), kid('a', 10), kid('gone', 5, { state: 'done', state_since: 1_000 }), s('q', 'idle', 2)];
    expect(panelSessions(all).map(x => x.id)).toEqual(['q', 'p']);
    expect(childrenOf(all, 'p', 1_000 + CHILD_DONE_MS - 1).map(x => x.id)).toEqual(['gone', 'a', 'b']);
    expect(childrenOf(all, 'p', 1_000 + CHILD_DONE_MS).map(x => x.id)).toEqual(['a', 'b']);
    expect(hasInactive([s('p', 'working', 1), kid('d', 1, { state: 'done' })]), 'dziecka nie ukrywa się osobno').toBe(false);
  });
});
