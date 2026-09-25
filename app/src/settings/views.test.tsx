import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from '../panel/App';
import type { AppRow, Diagnostics } from '../types';
import { defaultSettings } from './model';
import { SettingsView } from './SettingsView';
import { Wizard } from './Wizard';

const rows: AppRow[] = [
  { id: 'claude_code', detected: { found: true, path: 'C:/h/.claude', note: null }, status: { installed: false, detail: 'Hooki: brak' }, enabled: true },
  { id: 'codex', detected: { found: false, path: null, note: 'Nie znaleziono ~/.codex.' }, status: { installed: true, detail: 'Nic do instalowania' }, enabled: false },
  { id: 'agent_router', detected: { found: true, path: 'C:/h/.agent-router', note: null }, status: { installed: true, detail: 'Nic do instalowania' }, enabled: true },
];
const diag: Diagnostics = { version: '0.5.0', endpoint_port: 1, settings_path: 's', settings_error: null, hook_exe: null,
  autostart_registered: false, last_seen: {}, apps: [] };
const noop = async () => [] as string[];

describe('Wizard', () => {
  it('the look step offers the style gallery and the motion switch', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} initialStep="look" />);
    expect(html).toContain('gallery compact');
    expect(html).toContain('Pixel-art');
    expect(html).toContain('Anime');
  });
  it('starts with the apps it found; missing ones are greyed out with a hint', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} />);
    expect(html).toContain('Claude Code');
    expect(html).toContain('Nie znaleziono ~/.codex.');
    expect(html).toMatch(/<input[^>]*disabled[^>]*aria-label="Codex"|<input[^>]*aria-label="Codex"[^>]*disabled/);
  });
  it('asks for plan usage consent, off by default, and says where the token goes', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} initialStep="limits" />);
    expect(html).toContain('api.anthropic.com');
    expect(html).not.toMatch(/aria-label="Limity z Anthropic"[^>]*checked|checked[^>]*aria-label="Limity z Anthropic"/);
  });
});

describe('SettingsView', () => {
  it('look tab: seven style cards, the chosen one checked, motion switch and per-agent overrides', () => {
    const s = defaultSettings();
    const html = renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    for (const name of ['Naklejka', 'Szkic', 'Czysty', 'Pixel-art', 'Neon', 'Tusz', 'Pastel']) expect(html).toContain(name);
    expect(html).toMatch(/<button[^>]*aria-checked="true"[^>]*look-card[^>]*><canvas[^>]*><\/canvas><span>Naklejka<\/span>/);
    expect(html).toContain('Spokojny');
    expect(html).toContain('Anime');
    expect(html).toContain('Osobno dla agentów');
    expect(html).toContain('Jak domyślny');
    expect(html).toContain('Tak wygląda w pasku');
    expect(html).toContain('Najwięcej zwierzaków w pasku');
  });
  it('lists the apps with their integration state', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('Hooki: brak');
    expect(html).toContain('Agent Router');
  });
  it('offers a copyable report in diagnostics', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="diag" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('Skopiuj raport');
  });
});

describe('panel', () => {
  it('has a settings button', () => {
    const html = renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0} status={null} focusId={null}
      onJump={() => {}} onSettings={() => {}} />);
    expect(html).toContain('aria-label="Ustawienia"');
  });
});
