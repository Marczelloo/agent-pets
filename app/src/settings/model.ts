import { formatAgo } from '../tooltip/text';
import type { AppId, AppRow, Diagnostics, Settings } from '../types';

export const APP_LABEL: Record<AppId, string> = { claude_code: 'Claude Code', codex: 'Codex', agent_router: 'Agent Router' };
export const APP_HINT: Record<AppId, string> = {
  claude_code: 'Zainstaluję hooki w ~/.claude/settings.json (z kopią zapasową).',
  codex: 'Nic do instalowania: czytam pliki sesji z ~/.codex/sessions.',
  agent_router: 'Nic do instalowania: czytam ~/.agent-router/status.json.',
};
const SOURCE_LABEL: Record<string, string> = {
  claude_code: 'Claude Code', codex: 'Codex', agent_router: 'Agent Router', claude_usage: 'Limity Claude\'a',
};

export const WIZARD_STEPS = ['apps', 'limits', 'notify', 'look'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Jak `Settings::default()` w rdzeniu; używane, gdy aplikacja nie odpowiada (podgląd w przeglądarce). */
export function defaultSettings(): Settings {
  return {
    version: 1, apps: { claude_code: true, codex: true, agent_router: true }, claude_statusline: false, claude_plan_usage: false,
    notifications: { needs_you: true, done: true, limits: true }, pets: { skin: 'sketch', max_visible: 5 },
    power_saving: 'auto', autostart: true,
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
    `Serwer hooków: ${d.endpoint_port != null ? `port ${d.endpoint_port}` : 'nie działa'}`,
    `Ustawienia: ${d.settings_path}${d.settings_error ? ` (błąd: ${d.settings_error})` : ''}`,
    `hook.exe: ${d.hook_exe ?? 'brak'}`,
    `Autostart w rejestrze: ${d.autostart_registered ? 'tak' : 'nie'}`,
    ...d.apps.map(([id, on, detail]) => `${APP_LABEL[id]}: ${on ? 'włączone' : 'wyłączone'}, ${detail}`),
    ...Object.entries(d.last_seen).map(([k, ts]) => `${SOURCE_LABEL[k] ?? k}: ostatnie zdarzenie ${formatAgo(nowMs - ts)}`),
  ];
  return lines.join('\n');
}
