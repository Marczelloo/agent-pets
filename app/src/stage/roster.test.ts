import { describe, expect, it } from 'vitest';
import type { Session, State, Tool } from '../types';
import { Roster } from './roster';

const s = (id: string, state: State, tool: Tool | null = null, agent: 'claude' | 'codex' = 'claude'): Session => ({
  id, agent, origin: 'cli', title: id, cwd: '', state, tool, progress: null, context: null,
  started_at: 1, last_activity: 1, state_since: 1, turn_started_at: null,
  jump: { pid: null, session_id: id, cwd: '', app: null },
});

describe('Roster', () => {
  it('creates a pet per session with the right skin and scene', () => {
    const r = new Roster();
    r.sync([s('a', 'working', 'bash'), s('b', 'sleep', null, 'codex')], 0);
    expect(r.get('a')?.scene).toBe('bash');
    expect(r.get('a')?.pet.type).toBe('clawd');
    expect(r.get('b')?.pet.type).toBe('kodek');
  });
  it('switches scene only when the state changes', () => {
    const r = new Roster();
    r.sync([s('a', 'working', 'bash')], 0);
    const pet = r.get('a')!.pet;
    r.sync([s('a', 'working', 'bash')], 1);
    expect(r.get('a')!.pet).toBe(pet);
    r.sync([s('a', 'done')], 2);
    expect(r.get('a')!.scene).toBe('done');
    expect(r.get('a')!.pet).toBe(pet);
  });
  it('removes pets whose sessions disappeared', () => {
    const r = new Roster();
    r.sync([s('a', 'idle')], 0);
    r.sync([], 1);
    expect(r.get('a')).toBeUndefined();
  });
  it('does not spawn a pet for a session that is already ended', () => {
    const r = new Roster();
    r.sync([s('gone', 'ended')], 0);
    expect(r.get('gone')).toBeUndefined();
  });
  it('fades in on arrival and out after the goodbye wave', () => {
    const r = new Roster();
    r.sync([s('a', 'idle')], 10);
    const e = r.get('a')!;
    expect(r.alpha(e, 10)).toBe(0);
    expect(r.alpha(e, 10.3)).toBeCloseTo(1);
    r.sync([s('a', 'ended')], 20);
    expect(r.alpha(e, 20.5)).toBeCloseTo(1);
    expect(r.alpha(e, 21.5)).toBeCloseTo(0);
  });
});

describe('Roster with subagents', () => {
  it('the stage can pick the scene (a delegating parent, a mini saying goodbye)', () => {
    const r = new Roster();
    r.sync([s('p', 'thinking'), s('k', 'working', 'bash')], 0, v => (v.id === 'p' ? 'agent' : 'bye'));
    expect(r.get('p')?.scene).toBe('agent');
    expect(r.get('k')).toBeUndefined();
    r.sync([s('p', 'thinking'), s('k', 'working', 'bash')], 1);
    expect(r.get('k')?.scene).toBe('bash');
    r.sync([s('p', 'thinking'), s('k', 'working', 'bash')], 2, v => (v.id === 'k' ? 'bye' : 'thinking'));
    expect(r.get('k')?.scene).toBe('bye');
    expect(r.get('k')?.byeAt).toBe(2);
  });
});
