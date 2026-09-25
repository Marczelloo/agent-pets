import type { Limit, Session, TooltipContent } from '../types';
import { clampPct, progressFraction } from '../stage/hud';
import { routerLine } from '../stage/router';
import { t, lang } from '../i18n';

const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…');
const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? '';
const pad = (n: number) => String(n).padStart(2, '0');

export function actionLabel(s: Pick<Session, 'state' | 'tool'>): string {
  if (s.state === 'working') return t().tool[s.tool ?? 'other'] ?? t().tool.other;
  return t().state[s.state] ?? t().tool.other;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return t().time.now;
  if (s < 60) return t().time.secAgo(s);
  if (s < 3600) return t().time.minAgo(Math.floor(s / 60));
  return t().time.hourAgo(Math.floor(s / 3600));
}

export function formatReset(resetsAt: number | null, nowMs: number): string {
  if (resetsAt == null) return '';
  if (resetsAt <= nowMs) return t().time.resetSoon;
  const d = new Date(resetsAt);
  const hm = lang() === 'pl' ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return resetsAt - nowMs < 86_400_000 ? t().time.resetAt(hm) : t().time.resetDay(t().time.days[d.getDay()], hm);
}

export function petTooltip(s: Session, nowMs: number): TooltipContent {
  const lines = [actionLabel(s)];
  const f = progressFraction(s.progress);
  if (f != null && s.progress) lines.push(t().tooltip.tasks(s.progress.done, s.progress.total));
  if (s.context && s.context.max > 0) lines.push(t().tooltip.context(Math.round(clampPct(s.context.used * 100 / s.context.max))));
  if (s.router_task) lines.push(routerLine(s.router_task, nowMs, s.last_activity));
  lines.push(t().tooltip.lastActivity(formatAgo(nowMs - s.last_activity)));
  return {
    title: cut(s.title || basename(s.cwd) || t().tooltip.untitled, 80),
    subtitle: `${t().agent[s.agent] ?? s.agent} · ${t().origin[s.origin] ?? s.origin}`,
    lines,
  };
}

export function limitsTooltip(limits: Limit[], nowMs: number): TooltipContent {
  const lines: string[] = [];
  for (const agent of ['claude', 'codex']) for (const window of ['five_hour', 'weekly']) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    if (!l || !Number.isFinite(l.used_pct)) continue;
    const reset = formatReset(l.resets_at, nowMs);
    lines.push(`${agent === 'claude' ? t().agent.limitClaude : t().agent.codex} · ${t().window[window as 'five_hour' | 'weekly']}: ${Math.round(clampPct(l.used_pct))}%${reset ? ` · ${reset}` : ''}`);
  }
  return { title: t().limits.title, subtitle: '', lines };
}

export function badgeTooltip(hidden: Session[]): TooltipContent {
  const n = hidden.length;
  return {
    title: t().tooltip.moreSessions(n),
    subtitle: '',
    lines: hidden.slice(0, 6).map(s => `${cut(s.title || basename(s.cwd) || t().tooltip.untitled, 40)} · ${actionLabel(s)}`),
  };
}
