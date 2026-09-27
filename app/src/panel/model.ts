import { clampPct, progressFraction } from '../stage/hud';
import { actionLabel, formatReset } from '../tooltip/text';
import { isLive, routerHealth } from '../stage/router';
import type { AgentUsage, Limit, Session, UpdateStatus } from '../types';
import { formatTokens } from '../stats/model';
import { t } from '../i18n';
import { agentLabel, hostLabel, modelLabel } from '../model-label';

const URGENT = new Set(['needs_you', 'error']);

/** Najpierw sesje, które czekają na Ciebie albo mają błąd, potem od ostatnio aktywnej. Dzieci są pod rodzicem. */
export function panelSessions(sessions: Session[]): Session[] {
  return sessions.filter(s => !s.parent).sort((a, b) =>
    Number(URGENT.has(b.state)) - Number(URGENT.has(a.state)) || b.last_activity - a.last_activity || (a.id < b.id ? -1 : 1));
}

const INACTIVE = new Set(['idle', 'done', 'sleep', 'ended']);
/** Jak `dismiss::inactive` w rdzeniu: to zdejmuje „Usuń nieaktywne” (dzieci znikają z rodzicem, nie osobno). */
export const hasInactive = (sessions: Session[]): boolean => sessions.some(s => !s.parent && INACTIVE.has(s.state));

/** Zakończone dziecko znika z panelu po tym czasie. */
export const CHILD_DONE_MS = 10_000;
const FINISHED = new Set(['done', 'error', 'ended']);

/** Dzieci sesji (subagenci, zadania routera) od najstarszego; zakończone jeszcze przez 10 s. */
export function childrenOf(sessions: Session[], id: string, nowMs: number): Session[] {
  return sessions.filter(c => c.parent === id && !(FINISHED.has(c.state) && nowMs - c.state_since >= CHILD_DONE_MS))
    .sort((a, b) => a.started_at - b.started_at || (a.id < b.id ? -1 : 1));
}

export interface UpdateBar { text: string; action: string | null; pct: number | null }

/** Pasek nad listą sesji: tylko gdy jest coś do zrobienia z aktualizacją (albo błąd). */
export function updateBar(u: UpdateStatus | undefined): UpdateBar | null {
  const x = t().panel.update;
  switch (u?.state) {
    case 'available': return { text: x.available(u.version), action: x.install, pct: null };
    case 'downloading': return { text: x.downloading(u.version), action: null, pct: u.pct ?? 0 };
    case 'ready': return { text: x.ready(u.version), action: x.installNow, pct: null };
    case 'error': return u.verify ? { text: u.message, action: null, pct: null } : null;
    default: return null;
  }
}

/** Linia zużycia na karcie: tokeny sesji i dnia, koszt sesji tylko gdy większy od 0 (spec 0.11 §4.2). */
export function usageLine(s: Session, today: AgentUsage | undefined): string | null {
  if (!s.usage) return null;
  const u = t().panel.usage;
  const parts = [u.session(formatTokens(s.usage.tokens))];
  if (today) parts.push(u.today(formatTokens(today.tokens_today)));
  if (s.usage.cost > 0) parts.push(`$${s.usage.cost.toFixed(2)}`);
  return parts.join(' · ');
}

/** Paski konta, na którym działa sesja (subskrypcja Claude'a albo ChatGPT); tylko te z danymi. */
export function accountRows(s: Session, limits: Limit[], nowMs: number): LimitRow[] {
  const acct = s.usage?.account;
  if (acct !== 'claude' && acct !== 'codex') return [];
  return limitRows(limits, nowMs).filter(r => r.agent === acct && r.pct != null);
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
  return [agentLabel(s), modelLabel(s.model), hostLabel(s), basename(s.cwd)].filter(Boolean).join(' · ');
}

export function progressText(s: Session): string | null {
  return progressFraction(s.progress) == null || !s.progress ? null : `${s.progress.done}/${s.progress.total}`;
}

export function contextText(s: Session): string | null {
  return s.context && s.context.max > 0 ? `${Math.round(clampPct(s.context.used * 100 / s.context.max))}%` : null;
}

export interface ChildLabel { kind: 'type' | 'router' | 'bg' | 'warn'; text: string }

/** Etykiety subagenta: typ (gdy nie jest już tytułem), „Router”, „w tle” i ostrzeżenie o utkniętym zadaniu routera. */
export function childLabels(c: Session, nowMs: number): ChildLabel[] {
  const out: ChildLabel[] = [];
  const x = t().panel.child;
  if (c.sub?.kind === 'router') out.push({ kind: 'router', text: x.router });
  else if (c.sub?.agent_type && c.sub.agent_type !== c.title) out.push({ kind: 'type', text: c.sub.agent_type });
  if (c.sub?.background) out.push({ kind: 'bg', text: x.background });
  if (c.router_task && isLive(c.router_task)) {
    const h = routerHealth(c.router_task, nowMs, c.last_activity);
    if (h === 'stalled' || h === 'blocked') out.push({ kind: 'warn', text: t().router.health[h] });
  }
  return out;
}

export type ChildMark = 'run' | 'ok' | 'err' | 'idle';
export function childMark(c: Session): ChildMark {
  if (c.state === 'error') return 'err';
  if (c.state === 'done' || c.state === 'ended') return 'ok';
  return c.state === 'idle' || c.state === 'sleep' ? 'idle' : 'run';
}

/** Druga linia wiersza: bieżąca akcja, a po zakończeniu wynik („Skończył” także dla `ended`). */
export function childLine(c: Session): string {
  switch (childMark(c)) {
    case 'ok': return t().state.done;
    case 'err': return t().state.error;
    default: return c.action || actionLabel(c);
  }
}

/** Czas pracy jak na zegarze: 0:09, 1:12, 1:02:03. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
}
