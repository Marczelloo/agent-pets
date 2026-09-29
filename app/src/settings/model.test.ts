import { describe, expect, it } from 'vitest';
import type { AppRow, Diagnostics } from '../types';
import { appFor } from '../look';
import { APP_LABEL, appLabel, clampMaxVisible, defaultAppChoice, defaultSettings, doorOn, EXPERIMENTAL, reportText, withApp, withDoor } from './model';

const row = (id: AppRow['id'], found: boolean): AppRow =>
  ({ id, detected: { found, path: found ? `C:/home/.${id}` : null, note: found ? null : 'nie znaleziono' },
     status: { installed: false, detail: '' }, enabled: true });

describe('settings model', () => {
  it('experimental apps are never turned on just because they were found', () => {
    expect(EXPERIMENTAL).toEqual(['cursor', 'grok', 'zcode']);
    const s = defaultAppChoice([row('claude_code', true), row('copilot', true), row('cursor', true), row('grok', true), row('zcode', true)],
      defaultSettings());
    expect([s.apps.claude_code, s.apps.copilot, s.apps.cursor, s.apps.grok, s.apps.zcode]).toEqual([true, true, false, false, false]);
    const on = withApp(defaultSettings(), 'cursor', true);
    expect(defaultAppChoice([row('cursor', true)], on).apps.cursor).toBe(false);
  });
  it('turns pets on only for the apps that were found', () => {
    const s = defaultAppChoice([row('claude_code', true), row('codex', false), row('agent_router', true), row('opencode', true)], defaultSettings());
    expect(s.apps).toEqual({ claude_code: true, codex: false, agent_router: true, opencode: true, generic: true, copilot: false, antigravity: false, cursor: false, grok: false, zcode: false });
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
    expect(s.apps).toEqual({ claude_code: true, codex: false, agent_router: true, opencode: false, generic: true, copilot: false, antigravity: false, cursor: false, grok: false, zcode: false });
  });
  it('opencode is off and the door open by default, like the core', () => {
    expect([defaultSettings().apps.opencode, defaultSettings().apps.generic]).toEqual([false, true]);
  });
  it('Copilot and Antigravity are off by default, and a 0.10 file without them reads as off', () => {
    expect([defaultSettings().apps.copilot, defaultSettings().apps.antigravity]).toEqual([false, false]);
    const old = { ...defaultSettings(), apps: { claude_code: true, codex: true, agent_router: true, opencode: true, generic: true } } as unknown as ReturnType<typeof defaultSettings>;
    expect([old.apps.copilot === true, old.apps.antigravity === true]).toEqual([false, false]);
    expect(withApp(old, 'copilot', true).apps.copilot).toBe(true);
  });
  it('Cursor, Grok and ZCode are off by default, and a 0.11 file without them reads as off', () => {
    const d = defaultSettings().apps;
    expect([d.cursor, d.grok, d.zcode]).toEqual([false, false, false]);
    const old = { ...defaultSettings(), apps: { claude_code: true, codex: true, agent_router: true, opencode: true, generic: true, copilot: true, antigravity: false } } as unknown as ReturnType<typeof defaultSettings>;
    expect([old.apps.cursor === true, old.apps.grok === true, old.apps.zcode === true]).toEqual([false, false, false]);
    expect(withApp(old, 'zcode', true).apps.zcode).toBe(true);
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
    expect(appFor({ agent: 'copilot', origin: 'cli' })).toBe('copilot');
    expect(appFor({ agent: 'antigravity', origin: 'cli' })).toBe('antigravity');
  });
  it('keeps the pet limit between 1 and 8', () => {
    expect([clampMaxVisible(0), clampMaxVisible(5), clampMaxVisible(20), clampMaxVisible(Number.NaN)]).toEqual([1, 5, 8, 5]);
  });
  it('has a name for every app', () => {
    expect(Object.keys(APP_LABEL).sort()).toEqual(['agent_router', 'antigravity', 'claude_code', 'codex', 'copilot', 'cursor', 'grok', 'opencode', 'zcode']);
    expect([APP_LABEL.cursor, APP_LABEL.grok, APP_LABEL.zcode]).toEqual(['Cursor', 'Grok Build', 'ZCode']);
    expect([APP_LABEL.copilot, APP_LABEL.antigravity]).toEqual(['GitHub Copilot', 'Antigravity']);
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
