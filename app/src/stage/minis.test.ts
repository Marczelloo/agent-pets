import { describe, expect, it } from 'vitest';
import type { Session, SubKind } from '../types';
import { delegating, MINI_AFTER_MS, miniScene, minisLeftOf, minisOf, parentScene } from './minis';

function s(id: string, over: Partial<Session> = {}): Session {
  return { id, agent: 'claude', origin: 'cli', title: id, cwd: '', state: 'working', tool: 'bash', progress: null, context: null,
    started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: id, cwd: '', app: null },
    parent: null, sub: null, action: null, question: null, ...over };
}
const kid = (id: string, started: number, over: Partial<Session> = {}, kind: SubKind = 'claude') =>
  s(id, { parent: 'p', started_at: started, sub: { kind, agent_type: null, description: null, background: false }, ...over });
const P = s('p');

describe('mini pets', () => {
  it('appear after 5 s of work (short subagents do not flash)', () => {
    const all = [P, kid('a', 0)];
    expect(minisOf(P, all, 4_000, true).shown).toEqual([]);
    expect(minisOf(P, all, 5_000, true).shown.map(c => c.id)).toEqual(['a']);
    expect(MINI_AFTER_MS).toBe(5_000);
  });

  it('a finished child leaves after its short goodbye', () => {
    const done = kid('a', 0, { state: 'done', state_since: 30_000 });
    expect(minisOf(P, [P, done], 30_500, true).shown.map(c => c.id)).toEqual(['a'], );
    expect(minisOf(P, [P, done], 31_000, true).shown).toEqual([]);
    const young = kid('b', 27_000, { state: 'done', state_since: 30_000 });
    expect(minisOf(P, [P, young], 30_100, true).shown, 'nigdy nie był mini: nie żegna się').toEqual([]);
  });

  it('an error shows its pose for 1.5 s before leaving', () => {
    const e = kid('a', 0, { state: 'error', state_since: 30_000 });
    expect(miniScene(e, 31_000)).toBe('error');
    expect(miniScene(e, 31_600)).toBe('bye');
    expect(minisOf(P, [P, e], 32_400, true).shown).toHaveLength(1);
    expect(minisOf(P, [P, e], 32_600, true).shown).toHaveLength(0);
    expect(miniScene(kid('b', 0, { state: 'working', tool: 'edit' }), 40_000)).toBe('edit');
  });

  it('at most 3 minis, the rest counted as +N', () => {
    const kids = ['a', 'b', 'c', 'd', 'e'].map((id, i) => kid(id, i));
    const m = minisOf(P, [P, ...kids], 60_000, true);
    expect(m.shown.map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(m.more).toBe(2);
  });

  it('the setting turns them off', () => {
    expect(minisOf(P, [P, kid('a', 0)], 60_000, false)).toEqual({ shown: [], more: 0 });
  });

  it('only children of this parent', () => {
    const other = s('x', { parent: 'q', started_at: 0 });
    expect(minisOf(P, [P, other], 60_000, true).shown).toEqual([]);
  });

  it('the parent delegates while a working child has no mini yet', () => {
    expect(delegating(P, [P, kid('a', 57_000)], 60_000, true)).toBe(true);
    expect(delegating(P, [P, kid('a', 0)], 60_000, true), 'z samymi mini ma swój stan').toBe(false);
    expect(delegating(P, [P, kid('a', 0)], 60_000, false), 'mini wyłączone: poza „deleguje”').toBe(true);
    expect(delegating(P, [P, kid('a', 57_000, { state: 'done' })], 60_000, true)).toBe(false);
    expect(delegating(P, [P], 60_000, true)).toBe(false);
  });
});

describe('mini side', () => {
  it('minis grow the way the stage grows', () => {
    expect(minisLeftOf({ position: 'right', align: 'left' })).toBe(true);
    expect(minisLeftOf({ position: 'left', align: 'right' })).toBe(false);
    expect(minisLeftOf({ position: 'custom', align: 'right' })).toBe(true);
    expect(minisLeftOf({ position: 'floating', align: 'left' })).toBe(false);
    expect(minisLeftOf({ position: 'floating', align: 'center' })).toBe(true);
  });
});

describe('parent pose', () => {
  it('delegating never hides waiting, an error or the goodbye', () => {
    const young = kid('a', 57_000);
    expect(parentScene(s('p', { state: 'thinking', tool: null }), [P, young], 60_000, true)).toBe('agent');
    expect(parentScene(s('p', { state: 'needs_you', tool: null }), [P, young], 60_000, true)).toBe('needs');
    expect(parentScene(s('p', { state: 'error', tool: null }), [P, young], 60_000, false)).toBe('error');
    expect(parentScene(s('p', { state: 'ended', tool: null }), [P, young], 60_000, false)).toBe('bye');
    expect(parentScene(s('p', { state: 'working', tool: 'edit' }), [P], 60_000, true)).toBe('edit');
  });
  it('an idle parent listens to music, but not while it delegates', () => {
    const young = kid('a', 57_000);
    expect(parentScene(s('p', { state: 'idle', tool: null }), [P], 60_000, true, true)).toBe('vibe');
    expect(parentScene(s('p', { state: 'sleep', tool: null }), [P], 60_000, true, true)).toBe('doze');
    expect(parentScene(s('p', { state: 'idle', tool: null }), [P, young], 60_000, true, true)).toBe('agent');
    expect(parentScene(s('p', { state: 'idle', tool: null }), [P], 60_000, true)).toBe('idle');
  });
});
