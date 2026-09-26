import { describe, expect, it } from 'vitest';
import type { Session, State } from '../types';
import { Orderer } from './order';

const mk = (id: string, started_at: number, state: State = 'working', agent: Session['agent'] = 'claude', origin: Session['origin'] = 'cli'): Session => ({
  id, agent, origin, title: id, cwd: '', state, tool: null, progress: null, context: null,
  started_at, last_activity: started_at, state_since: started_at, turn_started_at: null,
  jump: { pid: null, session_id: id, cwd: '', app: null },
});
const ids = (v: Session[]) => v.map(s => s.id);

describe('Orderer', () => {
  it('start: by start time, like 0.6', () => {
    const o = new Orderer('start');
    expect(ids(o.display([mk('b', 2), mk('a', 1)], 0))).toEqual(['a', 'b']);
  });
  it('agent: Claude, then Codex, then router tasks; start time inside a group', () => {
    const o = new Orderer('agent');
    const v = [mk('r', 1, 'working', 'codex', 'router'), mk('x2', 4, 'working', 'codex'), mk('c', 3), mk('x1', 2, 'working', 'codex')];
    expect(ids(o.display(v, 0))).toEqual(['c', 'x1', 'x2', 'r']);
  });
  it('attention: waiting and failing first, then working, done, idle; a new group sticks only after 3 s', () => {
    const o = new Orderer('attention');
    const v = [mk('idle', 1, 'idle'), mk('work', 2), mk('done', 3, 'done'), mk('err', 4, 'error')];
    expect(ids(o.display(v, 0))).toEqual(['err', 'work', 'done', 'idle']);
    const asks = [mk('idle', 1, 'needs_you'), mk('work', 2), mk('done', 3, 'done'), mk('err', 4, 'error')];
    expect(ids(o.display(asks, 1_000))).toEqual(['err', 'work', 'done', 'idle']);
    expect(ids(o.display(asks, 3_999))).toEqual(['err', 'work', 'done', 'idle']);
    expect(ids(o.display(asks, 4_000))).toEqual(['idle', 'err', 'work', 'done']);
  });
  it('attention: a flicker back to the old group cancels the pending move', () => {
    const o = new Orderer('attention');
    o.display([mk('a', 1, 'idle'), mk('b', 2, 'working')], 0);
    o.display([mk('a', 1, 'working'), mk('b', 2, 'working')], 1_000);
    o.display([mk('a', 1, 'idle'), mk('b', 2, 'working')], 2_000);
    expect(ids(o.display([mk('a', 1, 'working'), mk('b', 2, 'working')], 4_500))).toEqual(['b', 'a']);
  });
  it('priority keeps the most important last (they survive the +N collapse)', () => {
    const o = new Orderer('attention');
    expect(ids(o.priority([mk('s', 1, 'sleep'), mk('n', 2, 'needs_you'), mk('w', 3)], 0))).toEqual(['s', 'w', 'n']);
    expect(ids(new Orderer('agent').priority([mk('b', 2, 'working', 'codex'), mk('a', 1)], 0))).toEqual(['a', 'b']);
  });
});
