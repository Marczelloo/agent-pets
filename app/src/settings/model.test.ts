import { describe, expect, it } from 'vitest';
import type { AppRow, Diagnostics } from '../types';
import { appFor } from '../look';
import { APP_LABEL, appLabel, clampMaxVisible, defaultAppChoice, defaultSettings, doorOn, reportText, withApp, withDoor } from './model';

const row = (id: AppRow['id'], found: boolean): AppRow =>
  ({ id, detected: { found, path: found ? `C:/home/.${id}` : null, note: found ? null : 'nie znaleziono' },
     status: { installed: false, detail: '' }, enabled: true });

describe('settings model', () => {
  it('turns pets on only for the apps that were found', () => {
    const s = defaultAppChoice([row('claude_code', true), row('codex', false), row('agent_router', true), row('opencode', true)], defaultSettings());
    expect(s.apps).toEqual({ claude_code: true, codex: false, agent_router: true, opencode: true, generic: true });
  });
  it('stage and update defaults mirror Settings::default() in the core', () => {
    const s = defaultSettings();
    expect(s.updates).toBe('notify');
    expect(s.stage).toEqual({
      position: 'right', monitor: 'primary', background: { kind: 'none', radius: 12 },
      size: 100, gap: 0, padding: 2, align: 'right', order: 'start', show: { progress: true, limits: true, badge: true },
      bubbles: { questions: true, actions: true }, minis: true,
    });
  });
  it('asks nothing of the network by default', () => {
    expect(defaultSettings().claude_plan_usage).toBe(false);
  });
  it('changes one app without touching the others', () => {
    const s = withApp(defaultSettings(), 'codex', false);
    expect(s.apps).toEqual({ claude_code: true, codex: false, agent_router: true, opencode: false, generic: true });
  });
  it('opencode is off and the door open by default, like the core', () => {
    expect([defaultSettings().apps.opencode, defaultSettings().apps.generic]).toEqual([false, true]);
  });
  it('a 0.9.1 file without the door switch shows the door open', () => {
    const old = { ...defaultSettings(), apps: { claude_code: true, codex: true, agent_router: true } } as unknown as ReturnType<typeof defaultSettings>;
    expect(doorOn(old)).toBe(true);
    expect(doorOn(withDoor(old, false))).toBe(false);
    expect(withDoor(old, false).apps).toEqual({ claude_code: true, codex: true, agent_router: true, generic: false });
  });
  it('opencode pets use the opencode look overrides', () => {
    expect(appFor({ agent: 'opencode', origin: 'cli' })).toBe('opencode');
    expect(appFor({ agent: 'other', origin: 'cli' })).toBeNull();
  });
  it('keeps the pet limit between 1 and 8', () => {
    expect([clampMaxVisible(0), clampMaxVisible(5), clampMaxVisible(20), clampMaxVisible(Number.NaN)]).toEqual([1, 5, 8, 5]);
  });
  it('has a name for every app', () => {
    expect(Object.keys(APP_LABEL).sort()).toEqual(['agent_router', 'claude_code', 'codex', 'opencode']);
    expect(appLabel('opencode')).toBe('opencode');
  });
  it('writes a report without tokens or session titles', () => {
    const d: Diagnostics = { version: '0.5.0', endpoint_port: 61000, settings_path: 'C:/h/.agent-pets/settings.json', settings_error: null,
      hook_exe: 'C:/h/.agent-pets/hook.exe', autostart_registered: true, last_seen: { codex: 1_000 },
      apps: [['claude_code', true, 'Hooki: zainstalowane'], ['codex', false, 'Nic do instalowania']],
      stats_files: 0, stats_scanned_bytes: 0, stats_total_bytes: 0 };
    const text = reportText(d, 61_000);
    expect(text).toContain('Agent Pets 0.5.0');
    expect(text).toContain('Serwer hooków: port 61000');
    expect(text).toContain('Codex: ostatnie zdarzenie 1 min temu');
    expect(text).toContain('Claude Code: włączone, Hooki: zainstalowane');
    expect(text.toLowerCase()).not.toContain('token');
  });
});
