// Stats window number formatting (spec 0.9, 3.1): compact, in Polish or English.
import { t } from '../i18n';
import type { BadgeKind, StatAgent, StatsProgress } from '../types';

const oneDecimal = (x: number) => {
  const r = Math.round(x * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', t().stats.num.dec);
};

/** 950, 12,4 tys., 48,2 mln, 1,3 mld (en: 12.4K, 48.2M, 1.3B). */
export function formatTokens(n: number): string {
  const { units, space } = t().stats.num;
  const steps: [number, string][] = [[1e9, units[2]], [1e6, units[1]], [1e3, units[0]]];
  for (const [base, unit] of steps) if (n >= base) return `${oneDecimal(n / base)}${space ? ' ' : ''}${unit}`;
  return String(Math.round(n));
}

/** 21 h 17 min, 45 min, 0 min. */
export function formatHours(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000), h = Math.floor(min / 60);
  return h > 0 ? t().stats.hm(h, min % 60) : t().stats.m(min);
}

export const formatPct = (x: number): string => `${Math.round(x)}%`;

/** ▲ 12% or ▼ 5%; no comparison is `null`. */
export const formatChange = (x: number | null): string | null => (x == null ? null : `${x >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(x))}%`);

export function agentName(a: StatAgent): string {
  return a === 'router' ? t().origin.router : t().agent[a];
}

export const badgeText = (k: BadgeKind): string => t().stats.badge[k];

/** Project display name; `:no-project` (conversation without a folder, home or temporary directory) is "No project". */
export const projectName = (p: string): string => (p === ':no-project' ? t().stats.noProject : p);

/** Initial scan progress in percent (empty queue = 100). */
export const scanPct = (p: StatsProgress): number => (p.total > 0 ? Math.min(100, Math.floor((p.scanned * 100) / p.total)) : 100);
