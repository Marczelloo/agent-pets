import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { PanelView } from '../panel/App';
import type { AppRow, Diagnostics, Settings, UpdateStatus } from '../types';
import { defaultSettings } from './model';
import { SettingsView } from './SettingsView';
import { resetStage, withBubbles } from './StageTab';
import { Wizard } from './Wizard';

const rows: AppRow[] = [
  { id: 'claude_code', detected: { found: true, path: 'C:/h/.claude', note: null }, status: { installed: false, detail: 'Hooki: brak' }, enabled: true },
  { id: 'codex', detected: { found: false, path: null, note: 'Nie znaleziono ~/.codex.' }, status: { installed: true, detail: 'Nic do instalowania' }, enabled: false },
  { id: 'agent_router', detected: { found: true, path: 'C:/h/.agent-router', note: null }, status: { installed: true, detail: 'Nic do instalowania' }, enabled: true },
];
const diag: Diagnostics = { version: '0.5.0', endpoint_port: 1, settings_path: 's', settings_error: null, hook_exe: null,
  autostart_registered: false, last_seen: {}, apps: [] };
const noop = async () => [] as string[];
afterEach(() => setLang('pl'));

describe('Wizard', () => {
  it('the look step offers the style gallery and the motion switch', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} initialStep="look" />);
    expect(html).toContain('gallery compact');
    expect(html).toContain('Pixel-art');
    expect(html).toContain('Dynami'); // Dynamiczny / Dynamic
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

describe('language', () => {
  it('general tab offers the language, and English renders English', () => {
    const s = { ...defaultSettings(), language: 'en' as const };
    setLang('en');
    const html = renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab="general" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('Język / Language');
    expect(html).toContain('Start with Windows');
    expect(html).not.toContain('Uruchamiaj z Windows');
  });
  it('the wizard shows a language picker on its first step', () => {
    const html = renderToString(<Wizard rows={rows} initial={defaultSettings()} onFinish={noop} />);
    expect(html).toContain('aria-label="Język / Language"');
  });
  it('new settings follow the system language', () => {
    expect(defaultSettings().language).toBe('auto');
  });
});

describe('SettingsView', () => {
  it('general tab: update mode select, check button with its result and the installed version', () => {
    const s = { ...defaultSettings(), updates: 'auto' as const };
    const view = (update?: UpdateStatus) => renderToString(<SettingsView settings={s} rows={rows} diag={{ ...diag, version: '0.7.0' }} tab="general"
      onTab={() => {}} onChange={() => {}} onIntegration={async () => ''} message={null} update={update} onCheck={() => {}} />);
    const html = view();
    expect(html).toContain('Aktualizacje');
    expect(html).toMatch(/<option[^>]*value="auto"[^>]*selected|<option[^>]*selected[^>]*value="auto"/);
    expect(html).toContain('Powiadamiaj');
    expect(html).toContain('Instaluj automatycznie');
    expect(html).toContain('Sprawdź teraz');
    expect(html).toContain('Wersja 0.7.0');
    expect(view({ state: 'latest' })).toContain('Masz najnowszą wersję');
    expect(view({ state: 'available', version: '0.7.1', notes: null })).toContain('Dostępna wersja 0.7.1');
    expect(view({ state: 'error', message: 'Błąd sprawdzania aktualizacji', verify: false })).toContain('Błąd sprawdzania aktualizacji');
  });
  it('renders the look tab in English after switching', () => {
    setLang('en');
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('Same as default');
    expect(html).not.toContain('Jak domyślny');
  });
  it('look tab: seven style cards, the chosen one checked, motion switch and per-agent overrides', () => {
    const s = defaultSettings();
    const html = renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    for (const name of ['Naklejka', 'Szkic', 'Czysty', 'Pixel-art', 'Neon', 'Tusz', 'Pastel']) expect(html).toContain(name);
    expect(html).toMatch(/<button[^>]*aria-checked="true"[^>]*look-card[^>]*><canvas[^>]*><\/canvas><span>Naklejka<\/span>/);
    expect(html).toContain('Spokojny');
    expect(html).toContain('Dynami'); // Dynamiczny / Dynamic
    expect(html).toContain('Osobno dla agentów');
    expect(html).toContain('Jak domyślny');
    expect(html).toContain('Tak wygląda w pasku');
    expect(html).not.toContain('Najwięcej zwierzaków w pasku'); // przeniesione do karty „Pasek”
  });
  it('taskbar tab: position, monitor, background, size, spacing, pet limit, alignment, order, elements and reset', () => {
    const monitors = [{ id: 'primary-dev', primary: true, width: 2560, height: 1440, index: 1, has_bar: true }, { id: 'second', primary: false, width: 1920, height: 1080, index: 2, has_bar: true }];
    const view = (stage: Partial<Settings['stage']>, leftFallback = false) => renderToString(<SettingsView
      settings={{ ...defaultSettings(), stage: { ...defaultSettings().stage, ...stage } }} rows={rows} diag={diag} tab="stage" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} monitors={monitors} leftFallback={leftFallback} onMove={() => {}} />);
    const html = view({});
    for (const s of ['Pozycja', 'Przy zasobniku', 'Po lewej', 'Własna', 'Pływające', 'Monitor', 'Ekran 2 · 1920×1080', '(główny)',
      'Tło', 'Brak', 'Szkło', 'Pełny kolor', 'Rozmiar zwierzaków', 'Odstęp', 'Margines', 'Najwięcej zwierzaków w pasku', 'Wyrównanie',
      'Kolejność', 'Paski postępu', 'Paski limitów', 'Plakietka „+N”', 'Przywróć domyślne']) expect(html, s).toContain(s);
    expect(html).toMatch(/aria-label="Rozmiar zwierzaków"[^>]*max="100"|max="100"[^>]*aria-label="Rozmiar zwierzaków"/);
    expect(html).toMatch(/role="radiogroup" aria-label="Wyrównanie"[^>]*aria-disabled="true"/);
    expect(html).not.toContain('Przesuń');
    const floating = view({ position: 'floating', size: 250 });
    expect(floating).toMatch(/max="300"/);
    expect(floating).not.toMatch(/role="radiogroup" aria-label="Wyrównanie"[^>]*aria-disabled="true"/);
    expect(view({ position: 'custom', custom_at: 0.3 })).toContain('Przesuń');
    expect(view({ size: 250 })).toMatch(/aria-valuetext="100%"/);
    expect(view({ size: 250 })).toContain('Większe tylko w oknie pływającym');
    expect(view({ position: 'left' }, true)).toContain('Ikony paska są wyrównane do lewej');
    expect(view({ background: { kind: 'glass', radius: 12 } })).toContain('Przezroczystość');
    expect(html).not.toContain('Przezroczystość');
  });
  it('taskbar tab: an unplugged saved monitor stays selected, a monitor without a taskbar gets a hint', () => {
    const monitors = [{ id: 'one', primary: true, width: 2560, height: 1440, index: 1, has_bar: true },
      { id: 'two', primary: false, width: 1920, height: 1080, index: 2, has_bar: false }];
    const view = (stage: Partial<Settings['stage']>) => renderToString(<SettingsView
      settings={{ ...defaultSettings(), stage: { ...defaultSettings().stage, ...stage } }} rows={rows} diag={diag} tab="stage" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} monitors={monitors} />);
    expect(view({ monitor: 'gone' })).toMatch(/<option value="gone" selected="">[^<]*odłączony/);
    expect(view({ monitor: 'two' })).toContain('Na tym monitorze nie ma paska zadań');
    expect(view({ monitor: 'two', position: 'floating' })).not.toContain('Na tym monitorze nie ma paska zadań');
    expect(view({ monitor: 'one' })).not.toContain('odłączony');
  });
  it('taskbar tab reset keeps the pet limit and everything outside the stage', () => {
    const s = { ...defaultSettings(), pets: { ...defaultSettings().pets, max_visible: 3 }, stage: { ...defaultSettings().stage, gap: 20, position: 'floating' as const } };
    const r = resetStage(s);
    expect(r.stage).toEqual(defaultSettings().stage);
    expect(r.pets.max_visible).toBe(3);
  });
  it('look tab: a big preview and every animation to pick, grouped, plus all in order', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('class="preview-stage"');
    for (const name of ['Wszystkie po kolei', 'Praca', 'Stany', 'Komendy', 'Subagent', 'Kompaktuje', 'Pożegnanie', 'Śpi']) expect(html).toContain(name);
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
  it('taskbar tab: bubbles and subagents section with three switches', () => {
    const s = defaultSettings();
    const html = renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab="stage" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} monitors={[]} leftFallback={false} onMove={() => {}} />);
    for (const t of ['Dymki i subagenci', 'Dymki z pytaniami', 'Dymki z akcją', 'Mini-zwierzaki subagentów']) expect(html, t).toContain(t);
    const off = withBubbles(withBubbles(withBubbles(s, 'questions', false), 'actions', false), 'minis', false);
    expect([off.stage.bubbles, off.stage.minis]).toEqual([{ questions: false, actions: false }, false]);
    expect(off.pets).toEqual(s.pets);
  });
  it('panel: subagents under their parent with descriptions, router health and a parent-only count', () => {
    const base = { agent: 'claude' as const, origin: 'cli' as const, cwd: '', tool: 'bash' as const, progress: null, context: null,
      last_activity: 50_000, state_since: 0, turn_started_at: null, question: null };
    const parent = { ...base, id: 'p', title: 'Główna', state: 'working' as const, started_at: 0, jump: { pid: null, session_id: 'p', cwd: '', app: null } };
    const kid = (id: string, kind: 'claude' | 'codex' | 'router', description: string, started: number) => ({
      ...base, id, title: description, state: 'working' as const, started_at: started, parent: 'p', action: kind === 'claude' ? 'Czyta a.rs' : null,
      agent: kind === 'claude' ? 'claude' as const : 'codex' as const, origin: kind === 'router' ? 'router' as const : 'cli' as const,
      sub: { kind, agent_type: null, description, background: false }, jump: { pid: null, session_id: id, cwd: '', app: null },
      router_task: kind === 'router' ? { task_id: 't', status: 'running', last_activity_at: 100_000, blocked: false, stall_ms: 180_000 } : null });
    const snap = { sessions: [parent, kid('p/a', 'claude', 'Znajdź testy', 10_000), kid('c1', 'codex', 'Newton', 20_000), kid('th', 'router', 'Policz pliki', 30_000)], limits: [], now: 0 };
    const html = renderToString(<PanelView snap={snap} nowMs={300_000} status={null} focusId="c1" onJump={() => {}} />);
    expect(html).toContain('1 sesja');
    for (const t of ['Znajdź testy', 'Newton', 'Policz pliki', 'Czyta a.rs', 'utknęło']) expect(html, t).toContain(t);
    expect(html.match(/class="kid[ "]/g)?.length).toBe(3);
    expect(html).toMatch(/class="kid[^"]*focus/);
    expect(html.indexOf('Znajdź testy')).toBeLessThan(html.indexOf('Newton'));
  });
});
