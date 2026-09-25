import { describe, expect, it } from 'vitest';
import type { AppRow, Diagnostics } from '../types';
import { APP_LABEL, clampMaxVisible, defaultAppChoice, defaultSettings, reportText, withApp } from './model';

const row = (id: AppRow['id'], found: boolean): AppRow =>
  ({ id, detected: { found, path: found ? `C:/home/.${id}` : null, note: found ? null : 'nie znaleziono' },
     status: { installed: false, detail: '' }, enabled: true });

describe('settings model', () => {
  it('turns pets on only for the apps that were found', () => {
    const s = defaultAppChoice([row('claude_code', true), row('codex', false), row('agent_router', true)], defaultSettings());
    expect(s.apps).toEqual({ claude_code: true, codex: false, agent_router: true });
  });
  it('asks nothing of the network by default', () => {
    expect(defaultSettings().claude_plan_usage).toBe(false);
  });
  it('changes one app without touching the others', () => {
    const s = withApp(defaultSettings(), 'codex', false);
    expect(s.apps).toEqual({ claude_code: true, codex: false, agent_router: true });
  });
  it('keeps the pet limit between 1 and 8', () => {
    expect([clampMaxVisible(0), clampMaxVisible(5), clampMaxVisible(20), clampMaxVisible(Number.NaN)]).toEqual([1, 5, 8, 5]);
  });
  it('has a name for every app', () => {
    expect(Object.keys(APP_LABEL).sort()).toEqual(['agent_router', 'claude_code', 'codex']);
  });
  it('writes a report without tokens or session titles', () => {
    const d: Diagnostics = { version: '0.5.0', endpoint_port: 61000, settings_path: 'C:/h/.agent-pets/settings.json', settings_error: null,
      hook_exe: 'C:/h/.agent-pets/hook.exe', autostart_registered: true, last_seen: { codex: 1_000 },
      apps: [['claude_code', true, 'Hooki: zainstalowane'], ['codex', false, 'Nic do instalowania']] };
    const text = reportText(d, 61_000);
    expect(text).toContain('Agent Pets 0.5.0');
    expect(text).toContain('Serwer hooków: port 61000');
    expect(text).toContain('Codex: ostatnie zdarzenie 1 min temu');
    expect(text).toContain('Claude Code: włączone, Hooki: zainstalowane');
    expect(text.toLowerCase()).not.toContain('token');
  });
});
