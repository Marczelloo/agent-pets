import { defaultPets, defaultStage } from '../look';
import { formatAgo } from '../tooltip/text';
import type { AppId, AppRow, Diagnostics, Settings } from '../types';
import { t } from '../i18n';

export const APP_LABEL: Record<AppId, string> = { claude_code: 'Claude Code', codex: 'Codex', agent_router: 'Agent Router', opencode: 'opencode', copilot: 'GitHub Copilot', antigravity: 'Antigravity',
  cursor: 'Cursor', grok: 'Grok Build', zcode: 'ZCode' };
export const appLabel = (id: AppId): string =>
  ({ claude_code: t().agent.claude, codex: t().agent.codex, agent_router: t().origin.router, opencode: t().agent.opencode,
     copilot: APP_LABEL.copilot, antigravity: t().agent.antigravity, cursor: APP_LABEL.cursor, grok: APP_LABEL.grok, zcode: APP_LABEL.zcode })[id];
export const appHint = (id: AppId): string => t().settings.appHint[id];
/** Integrations that may still break when the agent changes its hooks: marked "experimental" in settings, the wizard and the panel. */
export const EXPERIMENTAL: AppId[] = ['copilot', 'antigravity', 'cursor', 'grok', 'zcode'];
/** Integrations without a live check: never enabled merely because they were detected. */
export const OPT_IN: AppId[] = ['cursor', 'grok', 'zcode'];
export const appBadge = (id: AppId | null): string | undefined => id && EXPERIMENTAL.includes(id) ? t().settings.experimental : undefined;
const sourceLabel = (id: string): string => id === 'claude_usage' ? t().settings.sourceClaudeUsage : id in APP_LABEL ? appLabel(id as AppId) : id;

export const WIZARD_STEPS = ['apps', 'limits', 'notify', 'look'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Like core `Settings::default()`; used when the app does not respond (browser preview). */
export function defaultSettings(): Settings {
  return {
    version: 1, apps: { claude_code: true, codex: true, agent_router: true, opencode: false, generic: true, copilot: false, antigravity: false,
      cursor: false, grok: false, zcode: false }, claude_statusline: false, claude_plan_usage: false,
    notifications: { needs_you: true, done: true, limits: true }, pets: defaultPets(),
    power_saving: 'auto', autostart: true, language: 'auto', updates: 'notify', stage: defaultStage(),
  };
}

export const withApp = (s: Settings, id: AppId, on: boolean): Settings => ({ ...s, apps: { ...s.apps, [id]: on } });

/** Bridge (`/v1/events/generic`): missing field in a 0.9.1 file = open, as in core. */
export const doorOn = (s: Settings): boolean => s.apps.generic !== false;
export const withDoor = (s: Settings, on: boolean): Settings => ({ ...s, apps: { ...s.apps, generic: on } });

/** The wizard initially enables only apps found on the computer. */
export function defaultAppChoice(rows: AppRow[], s: Settings): Settings {
  return rows.reduce((acc, r) => withApp(acc, r.id, r.detected.found && !OPT_IN.includes(r.id)), s);
}

export const clampMaxVisible = (n: number) => (Number.isFinite(n) ? Math.min(8, Math.max(1, Math.round(n))) : 5);

/** "Copy report" text: widget state without tokens, content, or session titles. */
export function reportText(d: Diagnostics, nowMs: number): string {
  const lines = [
    `Agent Pets ${d.version}`,
    t().settings.report.server(d.endpoint_port != null ? `port ${d.endpoint_port}` : t().settings.report.inactive),
    t().settings.report.settings(d.settings_path, d.settings_error ? t().settings.report.error(d.settings_error) : ''),
    t().settings.report.hook(d.hook_exe ?? t().settings.report.missing),
    t().settings.report.autostart(d.autostart_registered ? t().settings.report.yes : t().settings.report.no),
    ...d.apps.map(([id, on, detail]) => `${appLabel(id)}: ${on ? t().settings.report.enabled : t().settings.report.disabled}, ${detail}`),
    ...Object.entries(d.last_seen).map(([k, ts]) => t().settings.report.lastSeen(sourceLabel(k), formatAgo(nowMs - ts))),
    d.log_tail.length ? t().settings.report.log(d.log_path) : t().settings.report.logEmpty(d.log_path),
    ...d.log_tail,
  ];
  return lines.join('\n');
}
