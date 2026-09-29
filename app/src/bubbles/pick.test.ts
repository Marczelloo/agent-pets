import { describe, expect, it } from 'vitest';
import type { Look, Session, Snapshot } from '../types';
import { Picker, SHORT_CHARS } from './pick';

const LOOK: Look = { style: 'clean', motion: 'calm' };
const looks = () => LOOK;
const ON = { questions: true, actions: true };

function s(id: string, over: Partial<Session> = {}): Session {
  return { id, agent: 'claude', origin: 'cli', title: id, cwd: '', state: 'working', tool: 'bash', progress: null, context: null,
    started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: id, cwd: '', app: null },
    parent: null, sub: null, action: null, question: null, ...over };
}
const snap = (sessions: Session[]): Snapshot => ({ sessions, limits: [], now: 0 });
const pets = (...ids: string[]) => ids.map((id, i) => ({ id, x: 40 + i * 50 }));

describe('bubble picker', () => {
  it('every waiting session gets its question', () => {
    const p = new Picker();
    const w = p.update(snap([s('a', { state: 'needs_you', question: 'Approve Bash? npm test' }), s('b', { state: 'needs_you', question: 'Question: Which one?' }), s('c')]),
      pets('a', 'b', 'c'), looks, ON, 0);
    expect(w.map(b => [b.id, b.kind, b.text, b.x])).toEqual([['a', 'question', 'Approve Bash? npm test', 40], ['b', 'question', 'Question: Which one?', 90]]);
  });

  it('the automatic bubble is short, the full text waits for hover', () => {
    const q = 'Allow Bash? npm run build && npm test -- --coverage';
    const w = new Picker().update(snap([s('a', { state: 'needs_you', question: q })]), pets('a'), looks, ON, 0);
    expect(w[0].full).toBe(q);
    expect(Array.from(w[0].text).length).toBeLessThanOrEqual(SHORT_CHARS + 1);
    expect(w[0].text.endsWith('…')).toBe(true);
    const short = new Picker().update(snap([s('a', { state: 'needs_you', question: 'Which one?' })]), pets('a'), looks, ON, 0);
    expect([short[0].text, short[0].full]).toEqual(['Which one?', 'Which one?']);
  });

  it('a waiting session without a question text still asks', () => {
    const w = new Picker().update(snap([s('a', { state: 'needs_you' })]), pets('a'), looks, ON, 0);
    expect(w).toHaveLength(1);
    expect(w[0].text.length).toBeGreaterThan(0);
  });

  it('shows an action only when it changes, for 3 s, one at a time', () => {
    const p = new Picker();
    expect(p.update(snap([s('a', { action: 'npm test' })]), pets('a'), looks, ON, 0)).toEqual([]);
    const w = p.update(snap([s('a', { action: 'Editing a.ts' })]), pets('a'), looks, ON, 1_000);
    expect(w.map(b => [b.id, b.kind, b.text])).toEqual([['a', 'action', 'Editing a.ts']]);
    expect(p.update(snap([s('a', { action: 'Editing a.ts' })]), pets('a'), looks, ON, 3_900)).toHaveLength(1);
    expect(p.update(snap([s('a', { action: 'Editing a.ts' })]), pets('a'), looks, ON, 4_000)).toEqual([]);
    expect(p.update(snap([s('a', { action: 'Editing a.ts' })]), pets('a'), looks, ON, 5_000), 'the same action does not return').toEqual([]);
    p.update(snap([s('a', { action: 'x' }), s('b', { action: 'y' })]), pets('a', 'b'), looks, ON, 6_000);
    const two = p.update(snap([s('a', { action: 'x2', last_activity: 1 }), s('b', { action: 'y2', last_activity: 2 })]), pets('a', 'b'), looks, ON, 7_000);
    expect(two.map(b => b.id), 'at most one action bubble: the newer one').toEqual(['b']);
  });

  it('questions take priority: no action bubble while anyone waits', () => {
    const p = new Picker();
    p.update(snap([s('a', { action: '1' }), s('b')]), pets('a', 'b'), looks, ON, 0);
    const w = p.update(snap([s('a', { action: '2' }), s('b', { state: 'needs_you', question: 'Allow?' })]), pets('a', 'b'), looks, ON, 100);
    expect(w.map(b => b.kind)).toEqual(['question']);
  });

  it('respects the settings', () => {
    const p = new Picker();
    const waiting = snap([s('a', { state: 'needs_you', question: 'Q' })]);
    expect(p.update(waiting, pets('a'), looks, { questions: false, actions: true }, 0)).toEqual([]);
    p.update(snap([s('b', { action: '1' })]), pets('b'), looks, ON, 0);
    expect(p.update(snap([s('b', { action: '2' })]), pets('b'), looks, { questions: true, actions: false }, 100)).toEqual([]);
  });

  it('children and pets that are not on the stage get no bubbles', () => {
    const p = new Picker();
    const kid = s('p/a', { parent: 'p', state: 'needs_you', question: 'Q' });
    expect(p.update(snap([kid]), pets('p/a'), looks, ON, 0)).toEqual([]);
    const hidden = s('h', { state: 'needs_you', question: 'Q' });
    expect(p.update(snap([hidden]), pets('other'), looks, ON, 0), 'under "+N" or hidden').toEqual([]);
    p.update(snap([s('z', { action: '1' })]), [], looks, ON, 0);
    expect(p.update(snap([s('z', { action: '2' })]), [], looks, ON, 100)).toEqual([]);
  });

  it('bubbles take the look of their pet', () => {
    const neon: Look = { style: 'neon', motion: 'calm' };
    const w = new Picker().update(snap([s('a', { state: 'needs_you', question: 'Q' })]), pets('a'), () => neon, ON, 0);
    expect(w[0].look).toEqual(neon);
  });
});
