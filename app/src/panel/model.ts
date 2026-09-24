import { clampPct, progressFraction } from '../stage/hud';
import { formatReset } from '../tooltip/text';
import type { Limit, Session } from '../types';

const URGENT = new Set(['needs_you', 'error']);
const AGENT: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };
const ORIGIN: Record<string, string> = { cli: 'CLI', desktop: 'aplikacja', router: 'Agent Router' };

/** Najpierw sesje, które czekają na Ciebie albo mają błąd, potem od ostatnio aktywnej. */
export function panelSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) =>
    Number(URGENT.has(b.state)) - Number(URGENT.has(a.state)) || b.last_activity - a.last_activity || (a.id < b.id ? -1 : 1));
}

export interface LimitRow { agent: 'claude' | 'codex'; window: 'five_hour' | 'weekly'; label: string; pct: number | null; reset: string }

/** Zawsze cztery wiersze; brak danych to `pct: null`, nigdy 0%. */
export function limitRows(limits: Limit[], nowMs: number): LimitRow[] {
  const rows: LimitRow[] = [];
  for (const agent of ['claude', 'codex'] as const) for (const window of ['five_hour', 'weekly'] as const) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    const ok = l != null && Number.isFinite(l.used_pct);
    rows.push({
      agent, window, label: `${agent === 'claude' ? 'Claude' : 'Codex'} · ${window === 'five_hour' ? '5h' : 'tydzień'}`,
      pct: ok ? clampPct(l!.used_pct) : null, reset: ok ? formatReset(l!.resets_at, nowMs) : '',
    });
  }
  return rows;
}

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? '';

export function sessionSubtitle(s: Session): string {
  return [AGENT[s.agent] ?? s.agent, ORIGIN[s.origin] ?? s.origin, basename(s.cwd)].filter(Boolean).join(' · ');
}

export function progressText(s: Session): string | null {
  return progressFraction(s.progress) == null || !s.progress ? null : `${s.progress.done}/${s.progress.total}`;
}

export function contextText(s: Session): string | null {
  return s.context && s.context.max > 0 ? `${Math.round(clampPct(s.context.used * 100 / s.context.max))}%` : null;
}
