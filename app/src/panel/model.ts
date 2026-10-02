import { LIMIT_AGENTS, clampPct, progressFraction, type LimitAgent } from '../stage/hud';
import { actionLabel, formatAgo, formatReset, limitName } from '../tooltip/text';
import { isLive, routerHealth } from '../stage/router';
import type { AgentUsage, Limit, NotificationEntry, Session, UpdateStatus } from '../types';
import { formatTokens } from '../stats/model';
import { t } from '../i18n';
import { agentLabel, hostLabel, modelLabel } from '../model-label';

const URGENT = new Set(['needs_you', 'error']);

/** Sessions waiting for you or in error first, then by latest activity. Children appear under their parent. */
export function panelSessions(sessions: Session[]): Session[] {
  return sessions.filter(s => !s.parent).sort((a, b) =>
    Number(URGENT.has(b.state)) - Number(URGENT.has(a.state)) || b.last_activity - a.last_activity || (a.id < b.id ? -1 : 1));
}

const INACTIVE = new Set(['idle', 'done', 'sleep', 'ended']);
/** Like core `dismiss::inactive`: this removes "Clear inactive" (children disappear with their parent, not separately). */
export const hasInactive = (sessions: Session[]): boolean => sessions.some(s => !s.parent && INACTIVE.has(s.state));

/** A finished child disappears from the panel after this time. */
export const CHILD_DONE_MS = 10_000;
const FINISHED = new Set(['done', 'error', 'ended']);

/** Session children (subagents, router tasks) oldest first; finished ones remain for 10 s. */
export function childrenOf(sessions: Session[], id: string, nowMs: number): Session[] {
  return sessions.filter(c => c.parent === id && !(FINISHED.has(c.state) && nowMs - c.state_since >= CHILD_DONE_MS))
    .sort((a, b) => a.started_at - b.started_at || (a.id < b.id ? -1 : 1));
}

export interface UpdateBar { text: string; action: string | null; pct: number | null }

/** Bar above the session list: only when an update needs attention (or has an error). */
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

/** Usage line on a card: session and daily tokens, session cost only above 0 (spec 0.11 §4.2). */
export function usageLine(s: Session, today: AgentUsage | undefined): string | null {
  if (!s.usage) return null;
  const u = t().panel.usage;
  const parts = [u.session(formatTokens(s.usage.tokens))];
  if (today) parts.push(u.today(formatTokens(today.tokens_today)));
  if (s.usage.cost > 0) parts.push(`$${s.usage.cost.toFixed(2)}`);
  return parts.join(' · ');
}

/** Bars for the account running the session (Claude or ChatGPT subscription); only those with data. */
export function accountRows(s: Session, limits: Limit[], nowMs: number): LimitRow[] {
  const acct = s.usage?.account;
  if (acct !== 'claude' && acct !== 'codex') return [];
  return limitRows(limits, nowMs).filter(r => r.agent === acct && r.pct != null);
}

export interface LimitRow { agent: LimitAgent; window: 'five_hour' | 'weekly'; label: string; pct: number | null; reset: string; stale: boolean }

/** Always four Claude and Codex rows; missing data is `pct: null`, never 0%. Antigravity only with data. */
export function limitRows(limits: Limit[], nowMs: number): LimitRow[] {
  const rows: LimitRow[] = [];
  for (const agent of LIMIT_AGENTS) for (const window of ['five_hour', 'weekly'] as const) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    const ok = l != null && Number.isFinite(l.used_pct);
    if (!ok && agent === 'antigravity') continue;
    rows.push({
      agent, window, label: `${limitName(agent)} · ${t().window[window]}`,
      pct: ok ? clampPct(l!.used_pct) : null,
      reset: !ok ? '' : l!.stale_since != null ? t().limits.asOf(formatAgo(nowMs - l!.stale_since)) : formatReset(l!.resets_at, nowMs),
      stale: ok && l!.stale_since != null,
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

/** Subagent labels: type (unless already the title), "Router", "in background", and a stalled router-task warning. */
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

/** Second row line: current action, then result on completion ("Finished" also for `ended`). */
export function childLine(c: Session): string {
  switch (childMark(c)) {
    case 'ok': return t().state.done;
    case 'err': return t().state.error;
    default: return c.action || actionLabel(c);
  }
}

/** Working time in clock format: 0:09, 1:12, 1:02:03. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000)), p = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
}

/** Unread count for the bell badge. */
export const unreadCount = (items: readonly NotificationEntry[]): number => items.filter(e => !e.read).length;

/** Time of a notification: "5 min ago" for the first day, then the date. */
export function notificationTime(at: number, nowMs: number): string {
  const d = nowMs - at;
  if (d < 24 * 3_600_000) return formatAgo(Math.max(0, d));
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
