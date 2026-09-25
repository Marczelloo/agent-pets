import type { Limit, Session, State, Tool } from '../types';

const CYCLE: [State, Tool | null][] = [
  ['working', 'edit'], ['working', 'bash'], ['thinking', null], ['working', 'web'], ['working', 'read'],
  ['working', 'grep'], ['working', 'agent'], ['working', 'mcp'], ['needs_you', null], ['done', null],
  ['compacting', null], ['idle', null], ['sleep', null], ['error', null],
];
const TITLES = ['Refaktor parsera', 'Migracja testów', 'Research UIA', 'Lint w routerze', 'Poprawka hooków',
  'Build release', 'README', 'Nowa skórka', 'Tooltip'];
const BASE = Date.now() - 60_000;

/** `count` sesji; każda co 6 s przechodzi do następnego stanu z `CYCLE`. */
export function demoSessions(count: number, nowMs: number): Session[] {
  return Array.from({ length: count }, (_, i) => {
    const phase = Math.floor(nowMs / 6000) + i * 3;
    const [state, tool] = CYCLE[phase % CYCLE.length];
    const id = `demo-${i + 1}`;
    return {
      id, agent: i % 2 ? 'codex' : 'claude', origin: i % 3 === 2 ? 'router' : i % 2 ? 'desktop' : 'cli',
      title: TITLES[i % TITLES.length], cwd: `C:\\work\\demo${i + 1}`, state, tool,
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

export function demoLimits(nowMs: number): Limit[] {
  return [
    { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: nowMs + 2 * 3_600_000 },
    { agent: 'claude', window: 'weekly', used_pct: 61, resets_at: nowMs + 3 * 86_400_000 },
    { agent: 'codex', window: 'five_hour', used_pct: 12, resets_at: nowMs + 4 * 3_600_000 },
    { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: nowMs + 5 * 86_400_000 },
  ];
}
