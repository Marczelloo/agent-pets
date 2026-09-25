import type { Limit, Session, TooltipContent } from '../types';
import { clampPct, progressFraction } from '../stage/hud';
import { routerLine } from '../stage/router';

const AGENT: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };
const ORIGIN: Record<string, string> = { cli: 'CLI', desktop: 'aplikacja', router: 'Agent Router' };
const TOOL: Record<string, string> = {
  edit: 'Edytuje pliki', bash: 'Uruchamia komendy', read: 'Czyta plik', grep: 'Przeszukuje kod',
  web: 'Szuka w sieci', agent: 'Zleca subagentowi', mcp: 'Używa narzędzia MCP', other: 'Pracuje',
};
const STATE: Record<string, string> = {
  thinking: 'Myśli', needs_you: 'Czeka na Ciebie', done: 'Skończył', error: 'Błąd', idle: 'Bezczynny',
  sleep: 'Śpi', compacting: 'Kompaktuje kontekst', ended: 'Zakończył sesję',
};
const WINDOW: Record<string, string> = { five_hour: '5h', weekly: 'tydzień' };
const DAYS = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];

const cut = (s: string, n: number) => ([...s].length <= n ? s : [...s].slice(0, n - 1).join('') + '…');
const basename = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? '';
const pad = (n: number) => String(n).padStart(2, '0');

export function actionLabel(s: Pick<Session, 'state' | 'tool'>): string {
  if (s.state === 'working') return TOOL[s.tool ?? 'other'] ?? TOOL.other;
  return STATE[s.state] ?? TOOL.other;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'teraz';
  if (s < 60) return `${s} s temu`;
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  return `${Math.floor(s / 3600)} h temu`;
}

export function formatReset(resetsAt: number | null, nowMs: number): string {
  if (resetsAt == null) return '';
  if (resetsAt <= nowMs) return 'reset wkrótce';
  const d = new Date(resetsAt);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return resetsAt - nowMs < 86_400_000 ? `reset ${hm}` : `reset ${DAYS[d.getDay()]} ${hm}`;
}

export function petTooltip(s: Session, nowMs: number): TooltipContent {
  const lines = [actionLabel(s)];
  const f = progressFraction(s.progress);
  if (f != null && s.progress) lines.push(`Zadania: ${s.progress.done}/${s.progress.total}`);
  if (s.context && s.context.max > 0) lines.push(`Kontekst: ${Math.round(clampPct(s.context.used * 100 / s.context.max))}%`);
  if (s.router_task) lines.push(routerLine(s.router_task, nowMs));
  lines.push(`Ostatnia aktywność: ${formatAgo(nowMs - s.last_activity)}`);
  return {
    title: cut(s.title || basename(s.cwd) || 'Sesja bez tytułu', 80),
    subtitle: `${AGENT[s.agent] ?? s.agent} · ${ORIGIN[s.origin] ?? s.origin}`,
    lines,
  };
}

export function limitsTooltip(limits: Limit[], nowMs: number): TooltipContent {
  const lines: string[] = [];
  for (const agent of ['claude', 'codex']) for (const window of ['five_hour', 'weekly']) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    if (!l || !Number.isFinite(l.used_pct)) continue;
    const reset = formatReset(l.resets_at, nowMs);
    lines.push(`${agent === 'claude' ? 'Claude' : 'Codex'} · ${WINDOW[window]}: ${Math.round(clampPct(l.used_pct))}%${reset ? ` · ${reset}` : ''}`);
  }
  return { title: 'Limity', subtitle: '', lines };
}

export function badgeTooltip(hidden: Session[]): TooltipContent {
  const n = hidden.length;
  const noun = n === 1 ? 'sesja' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'sesje' : 'sesji';
  return {
    title: `Jeszcze ${n} ${noun}`,
    subtitle: '',
    lines: hidden.slice(0, 6).map(s => `${cut(s.title || basename(s.cwd) || 'Sesja bez tytułu', 40)} · ${actionLabel(s)}`),
  };
}
