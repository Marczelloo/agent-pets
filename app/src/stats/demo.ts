// Stats window demo data: preview in a regular browser (`pnpm dev`, /stats.html) and tests.
import type { StatsDay, StatsView } from '../types';

const H = 3_600_000, MIN = 60_000;

function calendar(): StatsDay[] {
  const out: StatsDay[] = [];
  const today = new Date(2026, 8, 27);
  for (let i = 181; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const level = i === 0 ? 4 : seed < 0.35 ? 0 : seed < 0.55 ? 1 : seed < 0.75 ? 2 : seed < 0.9 ? 3 : 4;
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date, level, active_ms: level * 90 * MIN });
  }
  return out;
}

export function demoStats(): StatsView {
  return {
    empty: false,
    podium: [
      { project: 'Agent Pets', value: 11 * H + 42 * MIN, agent: 'claude' },
      { project: 'Agent Router MCP', value: 6 * H + 10 * MIN, agent: 'codex' },
      { project: 'szafa', value: 2 * H + 5 * MIN, agent: 'claude' },
    ],
    tiles: { tokens: 48_200_000, tokens_change: 12, cache_pct: 91, cache_read: 43_900_000, active_ms: 21 * H + 17 * MIN,
      longest_ms: 3 * H + 40 * MIN, sessions: 34, subagents: 57, questions: 19 },
    week: { this: { active_ms: 21 * H + 17 * MIN, tokens: 48_200_000, sessions: 34, top_project: 'Agent Pets', top_agent: 'claude' },
      last: { active_ms: 17 * H, tokens: 39_000_000, sessions: 27, top_project: 'Agent Pets', top_agent: 'codex' }, days_into_week: 3 },
    race: [
      { key: 'claude', agent: 'claude', value: 14 * H + 2 * MIN },
      { key: 'codex', agent: 'codex', value: 6 * H + 30 * MIN },
      { key: 'router', agent: 'router', value: 45 * MIN },
    ],
    calendar: calendar(),
    badges: [
      { kind: 'glutton', project: 'Agent Pets', agent: 'claude', value: 21_000_000 },
      { kind: 'cache_master', project: 'Agent Router MCP', agent: 'codex', value: 96 },
      { kind: 'night_owl', project: null, agent: null, value: 3 * H },
      { kind: 'marathon', project: 'Agent Pets', agent: 'claude', value: 3 * H + 40 * MIN },
    ],
    record: true,
  };
}
