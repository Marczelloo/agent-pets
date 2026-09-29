import type { Limit, Session, State, Tool } from '../types';
import { t } from '../i18n';

const CYCLE: [State, Tool | null][] = [
  ['working', 'edit'], ['working', 'bash'], ['thinking', null], ['working', 'web'], ['working', 'read'],
  ['working', 'grep'], ['working', 'agent'], ['working', 'mcp'], ['needs_you', null], ['done', null],
  ['compacting', null], ['idle', null], ['sleep', null], ['error', null],
];
const BASE = Date.now() - 60_000;

/** `count` sessions; each moves to the next `CYCLE` state every 6 s, unless `only` pins all to one state. */
export function demoSessions(count: number, nowMs: number, only?: [State, Tool | null] | null): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const phase = Math.floor(nowMs / 6000) + i * 3;
    const [state, tool] = only ?? CYCLE[phase % CYCLE.length];
    const id = `demo-${i + 1}`;
    return {
      id, agent: i % 2 ? 'codex' : 'claude', origin: i % 3 === 2 ? 'router' : i % 2 ? 'desktop' : 'cli',
      title: t().demo.titles[i % t().demo.titles.length], cwd: `C:\\work\\demo${i + 1}`, state, tool,
      progress: i % 3 === 0 ? { done: phase % 6, total: 6 } : null,
      context: i % 2 === 0 ? { used: 40_000 + i * 30_000, max: 200_000 } : null,
      started_at: BASE + i * 1000, last_activity: nowMs - i * 15_000, state_since: nowMs, turn_started_at: null,
      jump: { pid: null, session_id: id, cwd: '', app: null },
      router_task: i % 3 === 2
        ? { task_id: `task-${i + 1}`, status: 'running', last_activity_at: nowMs - i * 40_000, blocked: false, stall_ms: 180_000 }
        : null,
    };
  });
}

/** Subagents of the first demo session (panel preview): Explore, a stalled router task, and one finished in the background. */
export function demoChildren(nowMs: number): Session[] {
  const [a, b, c] = t().demo.subtasks, parent = 'demo-1';
  const kid = (n: number, over: Partial<Session>): Session => ({
    id: `${parent}/sub-${n}`, parent, agent: 'claude', origin: 'cli', title: '', cwd: 'C:\\work\\demo1', state: 'working', tool: 'grep',
    progress: null, context: null, started_at: nowMs - 72_000, last_activity: nowMs, state_since: nowMs, turn_started_at: null,
    jump: { pid: null, session_id: parent, cwd: '', app: null }, ...over,
  });
  return [
    kid(1, { title: a, action: t().demo.subActions[0], sub: { kind: 'claude', agent_type: 'Explore', description: a, background: false } }),
    kid(2, { title: b, agent: 'codex', tool: 'bash', action: t().demo.subActions[1], started_at: nowMs - 220_000, last_activity: nowMs - 200_000,
      sub: { kind: 'router', agent_type: null, description: null, background: false },
      router_task: { task_id: 'task-demo', status: 'running', last_activity_at: nowMs - 200_000, blocked: false, stall_ms: 180_000 } }),
    kid(3, { title: c, state: 'done', tool: null, started_at: nowMs - 52_000, sub: { kind: 'claude', agent_type: 'code-reviewer', description: c, background: true } }),
  ];
}

export function demoLimits(nowMs: number): Limit[] {
  return [
    { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: nowMs + 2 * 3_600_000 },
    { agent: 'claude', window: 'weekly', used_pct: 61, resets_at: nowMs + 3 * 86_400_000 },
    { agent: 'codex', window: 'five_hour', used_pct: 12, resets_at: nowMs + 4 * 3_600_000 },
    { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: nowMs + 5 * 86_400_000 },
  ];
}
