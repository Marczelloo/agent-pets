import { defaultPets } from '../look';
import { formatAgo } from '../tooltip/text';
import type { AppId, AppRow, Diagnostics, Settings } from '../types';
import { t } from '../i18n';

export const APP_LABEL: Record<AppId, string> = { claude_code: 'Claude Code', codex: 'Codex', agent_router: 'Agent Router' };
export const appLabel = (id: AppId): string => ({ claude_code: t().agent.claude, codex: t().agent.codex, agent_router: t().origin.router })[id];
export const appHint = (id: AppId): string => t().settings.appHint[id];
const sourceLabel = (id: string): string => id === 'claude_usage' ? t().settings.sourceClaudeUsage : id === 'claude_code' || id === 'codex' || id === 'agent_router' ? appLabel(id) : id;

export const WIZARD_STEPS = ['apps', 'limits', 'notify', 'look'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Jak `Settings::default()` w rdzeniu; używane, gdy aplikacja nie odpowiada (podgląd w przeglądarce). */
export function defaultSettings(): Settings {
  return {
    version: 1, apps: { claude_code: true, codex: true, agent_router: true }, claude_statusline: false, claude_plan_usage: false,
    notifications: { needs_you: true, done: true, limits: true }, pets: defaultPets(),
    power_saving: 'auto', autostart: true, language: 'auto',
  };
}

export const withApp = (s: Settings, id: AppId, on: boolean): Settings => ({ ...s, apps: { ...s.apps, [id]: on } });

/** Kreator zaczyna z włączonymi tylko tymi aplikacjami, które znaleziono na komputerze. */
export function defaultAppChoice(rows: AppRow[], s: Settings): Settings {
  return rows.reduce((acc, r) => withApp(acc, r.id, r.detected.found), s);
}

export const clampMaxVisible = (n: number) => (Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : 5);

/** Tekst „Skopiuj raport”: stan widżetu bez tokenów, treści i tytułów sesji. */
export function reportText(d: Diagnostics, nowMs: number): string {
  const lines = [
    `Agent Pets ${d.version}`,
    t().settings.report.server(d.endpoint_port != null ? `port ${d.endpoint_port}` : t().settings.report.inactive),
    t().settings.report.settings(d.settings_path, d.settings_error ? t().settings.report.error(d.settings_error) : ''),
    t().settings.report.hook(d.hook_exe ?? t().settings.report.missing),
    t().settings.report.autostart(d.autostart_registered ? t().settings.report.yes : t().settings.report.no),
    ...d.apps.map(([id, on, detail]) => `${appLabel(id)}: ${on ? t().settings.report.enabled : t().settings.report.disabled}, ${detail}`),
    ...Object.entries(d.last_seen).map(([k, ts]) => t().settings.report.lastSeen(sourceLabel(k), formatAgo(nowMs - ts))),
  ];
  return lines.join('\n');
}
