import { clampPct, progressFraction } from '../stage/hud';
import { formatReset } from '../tooltip/text';
import type { Limit, Session, UpdateStatus } from '../types';
import { t } from '../i18n';

const URGENT = new Set(['needs_you', 'error']);

/** Najpierw sesje, które czekają na Ciebie albo mają błąd, potem od ostatnio aktywnej. */
export function panelSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) =>
    Number(URGENT.has(b.state)) - Number(URGENT.has(a.state)) || b.last_activity - a.last_activity || (a.id < b.id ? -1 : 1));
}

const INACTIVE = new Set(['idle', 'done', 'sleep', 'ended']);
/** Jak `dismiss::inactive` w rdzeniu: to zdejmuje „Usuń nieaktywne”. */
export const hasInactive = (sessions: Session[]): boolean => sessions.some(s => INACTIVE.has(s.state));

export interface UpdateBar { text: string; action: string | null; pct: number | null }

/** Pasek nad listą sesji: tylko gdy jest coś do zrobienia z aktualizacją (albo błąd). */
export function updateBar(u: UpdateStatus | undefined): UpdateBar | null {
  const x = t().panel.update;
  switch (u?.state) {
    case 'available': return { text: x.available(u.version), action: x.install, pct: null };
    case 'downloading': return { text: x.downloading(u.version), action: null, pct: u.pct ?? 0 };
    case 'ready': return { text: x.ready(u.version), action: x.installNow, pct: null };
    case 'error': return { text: u.message, action: null, pct: null };
    default: return null;
  }
}

export interface LimitRow { agent: 'claude' | 'codex'; window: 'five_hour' | 'weekly'; label: string; pct: number | null; reset: string }

/** Zawsze cztery wiersze; brak danych to `pct: null`, nigdy 0%. */
export function limitRows(limits: Limit[], nowMs: number): LimitRow[] {
  const rows: LimitRow[] = [];
  for (const agent of ['claude', 'codex'] as const) for (const window of ['five_hour', 'weekly'] as const) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    const ok = l != null && Number.isFinite(l.used_pct);
    rows.push({
      agent, window, label: `${agent === 'claude' ? t().agent.limitClaude : t().agent.codex} · ${t().window[window]}`,
      pct: ok ? clampPct(l!.used_pct) : null, reset: ok ? formatReset(l!.resets_at, nowMs) : '',
    });
  }
  return rows;
}

const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? '';

export function sessionSubtitle(s: Session): string {
  return [t().agent[s.agent] ?? s.agent, t().origin[s.origin] ?? s.origin, basename(s.cwd)].filter(Boolean).join(' · ');
}

export function progressText(s: Session): string | null {
  return progressFraction(s.progress) == null || !s.progress ? null : `${s.progress.done}/${s.progress.total}`;
}

export function contextText(s: Session): string | null {
  return s.context && s.context.max > 0 ? `${Math.round(clampPct(s.context.used * 100 / s.context.max))}%` : null;
}
