import { describe, expect, it } from 'vitest';
import type { Bridge } from './bridge';
import { Hover } from './hover';
import { layout } from './layout';
import type { Session } from '../types';

const sess: Session = {
  id: 'a', agent: 'claude', origin: 'cli', title: 'a', cwd: '', state: 'working', tool: null, progress: null, context: null,
  started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: 'a', cwd: '', app: null },
};

describe('Hover', () => {
  it('a right click opens the stage menu for the pet under the cursor, or a general one elsewhere', () => {
    const calls: [string | null, number, number][] = [];
    const bridge = { openMenu: (id: string | null, x: number, y: number) => calls.push([id, x, y]), hideTooltip: () => {} } as unknown as Bridge;
    const out = layout({ sessions: [sess], hasLimits: false, maxWidth: 500 });
    const h = new Hover(bridge, () => ({ out, snap: { sessions: [sess], limits: [], now: 0 }, height: 48, nowMs: 0 }));
    h.pointer({ kind: 'context', x: out.pets[0].x, y: 30 });
    h.pointer({ kind: 'context', x: out.width + 50, y: 30 });
    expect(calls).toEqual([['a', out.pets[0].x, 30], [null, out.width + 50, 30]]);
  });
});
