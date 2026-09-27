import { describe, expect, it } from 'vitest';
import type { Session, State, Tool } from '../types';
import { Roster } from './roster';
import { sceneFor } from './sceneFor';

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
  it('a pet in headphones throws them off when work starts, but takes them off quietly when the music stops', () => {
    const phones = (r: Roster) => r.get('a')!.pet.parts.filter((q: any) => q.k === 'phones').length;
    const r = new Roster();
    r.sync([s('a', 'idle')], 0, x => sceneFor(x, true));
    expect(r.get('a')!.scene).toBe('vibe');
    r.get('a')!.pet.phA = 1;
    r.sync([s('a', 'idle')], 1, x => sceneFor(x, false));
    expect(r.get('a')!.scene).toBe('idle');
    expect(phones(r)).toBe(0);
    r.sync([s('a', 'sleep')], 2, x => sceneFor(x, true));
    expect(r.get('a')!.scene).toBe('doze');
    r.get('a')!.pet.phA = 1;
    r.sync([s('a', 'working', 'edit')], 3, x => sceneFor(x, true));
    expect(r.get('a')!.scene).toBe('edit');
    expect(phones(r)).toBe(1);
    expect(r.get('a')!.pet.phA).toBe(0);
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
