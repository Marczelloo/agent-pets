import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { PanelView } from '../panel/App';
import { petTooltip } from '../tooltip/text';
import type { RouterTask, Session } from '../types';
import { routerHealth, routerLine } from './router';

const task = (over: Partial<RouterTask> = {}): RouterTask =>
  ({ task_id: 't1', status: 'running', last_activity_at: 1_000_000, blocked: false, stall_ms: 180_000, ...over });

const sess = (router_task: RouterTask | null): Session => ({
  id: 'th', agent: 'codex', origin: 'router', title: 'Policz pliki', cwd: 'C:/work', state: 'working', tool: 'bash',
  progress: null, context: null, started_at: 0, last_activity: 1_000_000, state_since: 0, turn_started_at: null,
  jump: { pid: null, session_id: 'th', cwd: '', app: null }, router_task,
});

describe('router task health', () => {
  it('goes active, quiet, stalled with time, even when the status file did not change', () => {
    const t = task();
    expect(routerHealth(t, 1_000_000 + 30_000)).toBe('active');
    expect(routerHealth(t, 1_000_000 + 30_001)).toBe('quiet');
    expect(routerHealth(t, 1_000_000 + 180_000)).toBe('quiet');
    expect(routerHealth(t, 1_000_000 + 180_001)).toBe('stalled');
  });
  it('counts activity the pet saw in the rollout too', () => {
    // plik statusu mógł zostać zapisany dawno, a Codex dalej pisze do rolloutu
    expect(routerHealth(task(), 1_000_000 + 300_000, 1_000_000 + 295_000)).toBe('active');
    expect(routerLine(task(), 1_000_000 + 300_000, 1_000_000 + 295_000)).toBe('Zadanie routera: aktywne');
  });
  it('blocked wins and a task that has not started is active', () => {
    expect(routerHealth(task({ blocked: true }), 1_000_000)).toBe('blocked');
    expect(routerHealth(task({ last_activity_at: null }), 9e12)).toBe('active');
  });
  it('labels running and finished tasks', () => {
    expect(routerLine(task(), 1_000_000 + 200_000)).toBe('Zadanie routera: utknęło');
    expect(routerLine(task({ status: 'completed' }), 0)).toBe('Zadanie routera: zakończone');
    expect(routerLine(task({ status: 'quota_exhausted' }), 0)).toBe('Zadanie routera: brak limitu');
    expect(routerLine(task({ status: 'pending', last_activity_at: null }), 0)).toBe('Zadanie routera: aktywne');
  });
  it('shows up in the tooltip and the panel only for router tasks', () => {
    const now = 1_000_000 + 5_000;
    expect(petTooltip(sess(task()), now).lines).toContain('Zadanie routera: aktywne');
    expect(petTooltip(sess(null), now).lines.some(l => l.startsWith('Zadanie routera'))).toBe(false);
    const html = renderToString(createElement(PanelView, { snap: { sessions: [sess(task({ blocked: true }))], limits: [], now },
      nowMs: now, status: null, focusId: null, onJump: () => {}, animate: false }));
    expect(html).toContain('Zadanie routera: zablokowane');
  });
});
