import { describe, expect, it } from 'vitest';
import type { Session, State } from '../types';
import { CHILD_DONE_MS, childLabels, childLine, childMark, childrenOf, clock, contextText, hasInactive, limitRows, panelSessions, progressText, sessionSubtitle } from './model';

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
    expect(sessionSubtitle({ ...x, origin: 'cli', model: 'gpt-6-sol', agent: 'opencode', jump: { ...x.jump, app: 'vscode' } })).toBe('opencode · GPT-6 Sol · VS Code · a');
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
  const sub = (over: Partial<Session> = {}): Session => ({
    ...s('k', 'working', 0), parent: 'p', title: 'Znajdź testy', action: 'Szukanie: bubble',
    sub: { kind: 'claude', agent_type: 'Explore', description: 'Znajdź testy', background: false }, ...over,
  });
  it('labels a subagent with its type and "background"; the type is not repeated when it is the title', () => {
    expect(childLabels(sub(), 0)).toEqual([{ kind: 'type', text: 'Explore' }]);
    expect(childLabels(sub({ sub: { kind: 'claude', agent_type: 'Explore', description: 'X', background: true } }), 0))
      .toEqual([{ kind: 'type', text: 'Explore' }, { kind: 'bg', text: 'w tle' }]);
    expect(childLabels(sub({ title: 'Explore', sub: { kind: 'claude', agent_type: 'Explore', description: null, background: false } }), 0)).toEqual([]);
    expect(childLabels(sub({ sub: null }), 0)).toEqual([]);
  });
  it('a router task is labelled Router and warns only when it is stuck or blocked', () => {
    const task = { task_id: 't', status: 'running', last_activity_at: 0, blocked: false, stall_ms: 180_000 };
    const r = sub({ agent: 'codex', sub: { kind: 'router', agent_type: null, description: null, background: false }, router_task: task });
    expect(childLabels(r, 60_000)).toEqual([{ kind: 'router', text: 'Router' }]);
    expect(childLabels(r, 200_000)).toEqual([{ kind: 'router', text: 'Router' }, { kind: 'warn', text: 'utknęło' }]);
    expect(childLabels({ ...r, router_task: { ...task, blocked: true } }, 0)[1]).toEqual({ kind: 'warn', text: 'zablokowane' });
  });
  it('the second line is the current action while working, else the outcome', () => {
    expect([childMark(sub()), childLine(sub())]).toEqual(['run', 'Szukanie: bubble']);
    expect(childLine(sub({ action: null, tool: 'bash' }))).toBe('Uruchamia komendy');
    for (const st of ['done', 'ended'] as State[]) expect([childMark(sub({ state: st })), childLine(sub({ state: st }))]).toEqual(['ok', 'Skończył']);
    expect([childMark(sub({ state: 'error' })), childLine(sub({ state: 'error' }))]).toEqual(['err', 'Błąd']);
    expect(childMark(sub({ state: 'idle' }))).toBe('idle');
  });
  it('running time reads like a clock', () => {
    expect([clock(0), clock(9_999), clock(72_000), clock(3_723_000), clock(-5)]).toEqual(['0:00', '0:09', '1:12', '1:02:03', '0:00']);
  });
});
