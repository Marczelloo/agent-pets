import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setLang } from '../i18n';
import { PanelView } from '../panel/App';
import type { AppRow, Diagnostics, Settings, UpdateStatus } from '../types';
import { defaultSettings } from './model';
import { SettingsView, type Tab } from './SettingsView';
import { resetStage, withBubbles } from './StageTab';
import { Wizard } from './Wizard';

const rows: AppRow[] = [
  { id: 'claude_code', detected: { found: true, path: 'C:/h/.claude', note: null }, status: { installed: false, detail: 'Hooki: brak' }, enabled: true },
  { id: 'codex', detected: { found: false, path: null, note: 'Nie znaleziono ~/.codex.' }, status: { installed: true, detail: 'Nic do instalowania' }, enabled: false },
  { id: 'agent_router', detected: { found: true, path: 'C:/h/.agent-router', note: null }, status: { installed: true, detail: 'Nic do instalowania' }, enabled: true },
  { id: 'opencode', detected: { found: true, path: 'C:/h/.config/opencode', note: null }, status: { installed: false, detail: 'Plugin: brak' }, enabled: false },
  { id: 'copilot', detected: { found: true, path: 'C:/h/.copilot', note: null }, status: { installed: false, detail: 'Hooki: brak' }, enabled: false },
  { id: 'antigravity', detected: { found: false, path: null, note: 'Nie znaleziono ~/.gemini.' }, status: { installed: false, detail: 'Hooki: brak' }, enabled: false },
];
const found = (id: AppRow['id']): AppRow =>
  ({ id, detected: { found: true, path: `C:/h/.${id}`, note: null }, status: { installed: false, detail: 'Hooki: brak' }, enabled: false });
const newRows: AppRow[] = [...rows, found('cursor'), found('grok'), found('zcode')];
const diag: Diagnostics = { version: '0.5.0', endpoint_port: 1, settings_path: 's', settings_error: null, hook_exe: null,
  autostart_registered: false, last_seen: {}, apps: [], stats_files: 0, stats_scanned_bytes: 0, stats_total_bytes: 0,
  log_path: '', log_tail: [] };
const noop = async () => [] as string[];
afterEach(() => setLang('pl'));

describe('Wizard', () => {
  it('a found Cursor, Grok or ZCode stays off until the person turns it on; they, Copilot and Antigravity wear the experimental badge', () => {
    const html = renderToString(<Wizard rows={newRows} initial={defaultSettings()} onFinish={noop} />);
    for (const label of ['Cursor', 'Grok Build', 'ZCode']) expect(html).toMatch(new RegExp(`aria-label="${label}"(?![^>]*checked="")`));
    expect(html).toMatch(/aria-label="Claude Code"[^>]*checked=""/);
    expect(html.match(/class="badge">eksperymentalne</g)?.length).toBe(3 + 2);
    expect(html).toContain('~/.cursor/hooks.json');
  });
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

describe('settings shell and appearance', () => {
  const render = (tab: Tab, s = defaultSettings()) => renderToString(<SettingsView settings={s} rows={rows} diag={diag} tab={tab} onTab={() => {}}
    onChange={() => {}} onIntegration={async () => ''} message={null} />);
  it('the sidebar groups the tabs under Ustawienia and Aplikacja', () => {
    const html = render('general');
    expect(html).toContain('Ustawienia');
    expect(html).toContain('Aplikacja');
    for (const tab of ['Aplikacje', 'Wygląd', 'Pasek', 'Powiadomienia', 'Limity', 'Ogólne', 'Diagnostyka']) expect(html).toContain(tab);
    expect(html).toMatch(/aria-current="page"[^>]*>(<svg[^>]*>.*?<\/svg>)?<span>Ogólne</);
  });
  it('general tab: theme is an icon-only radiogroup of system, light and dark with the current one checked', () => {
    const html = render('general', { ...defaultSettings(), theme: 'dark' });
    expect(html).toContain('Motyw');
    expect(html).toMatch(/role="radiogroup" aria-label="Motyw"/);
    expect(html.match(/role="radio" aria-checked="(true|false)"[^>]*title="(Systemowy|Jasny|Ciemny)"/g)?.length).toBe(3);
    expect(html).toMatch(/aria-checked="true"[^>]*title="Ciemny"/);
  });
  it('general tab: power saving is a segmented control and the language stays a labelled select', () => {
    const html = render('general', { ...defaultSettings(), power_saving: 'always' });
    expect(html).toMatch(/role="radiogroup" aria-label="Tryb oszczędny"/);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Zawsze</);
    expect(html).toContain('aria-label="Język / Language"');
  });
  it('the theme labels are English after switching', () => {
    setLang('en');
    const html = render('general');
    expect(html).toContain('Theme');
    expect(html).toContain('title="Dark"');
  });
});

describe('SettingsView', () => {
  it('general tab: update mode select, check button with its result and the installed version', () => {
    const s = { ...defaultSettings(), updates: 'auto' as const };
    const view = (update?: UpdateStatus) => renderToString(<SettingsView settings={s} rows={rows} diag={{ ...diag, version: '0.7.0' }} tab="general"
      onTab={() => {}} onChange={() => {}} onIntegration={async () => ''} message={null} update={update} onCheck={() => {}} />);
    const html = view();
    expect(html).toContain('Aktualizacje');
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Instaluj automatycznie</);
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
    expect(html).not.toContain('Najwięcej zwierzaków w pasku'); // moved to the Taskbar tab
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
  it('taskbar tab: position is a set of cards and the Move row sits in that same section only for a custom position', () => {
    const view = (stage: Partial<Settings['stage']>) => renderToString(<SettingsView
      settings={{ ...defaultSettings(), stage: { ...defaultSettings().stage, ...stage } }} rows={rows} diag={diag} tab="stage" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} monitors={[]} onMove={() => {}} />);
    const first = (h: string) => { const a = h.indexOf('<h3>Położenie</h3>'); return h.slice(a, h.indexOf('<h3>', a + 4)); };
    const custom = first(view({ position: 'custom', custom_at: 0.3 }));
    expect(custom).toMatch(/class="ui-card on"/);
    expect(custom).toContain('<svg');
    expect(custom).toContain('Przesuń');
    expect(first(view({ position: 'right' }))).not.toContain('Przesuń');
    expect(view({}).match(/<h3>[^<]*<\/h3>/g)).toEqual(['<h3>Położenie</h3>', '<h3>Okno</h3>', '<h3>Zwierzaki</h3>', '<h3>Elementy</h3>', '<h3>Dymki i subagenci</h3>']);
  });
  it('taskbar tab: the pet limit is a stepper with a name and no native number input', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="stage" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} monitors={[]} onMove={() => {}} />);
    expect(html).toContain('class="ui-stepper"');
    expect(html).toContain('aria-label="Najwięcej zwierzaków w pasku"');
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain('class="segmented"');
    expect(html).not.toContain('class="card"');
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
    for (const name of ['Wszystkie po kolei', 'Praca', 'Stany', 'Reakcje', 'Komendy', 'Subagent', 'Kompaktuje', 'Pożegnanie', 'Śpi']) expect(html).toContain(name);
  });
  it('look tab: sections run Podgląd, Styl, Ruch, Dymki, the taskbar, Osobno dla agentów and no old button rows remain', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    const at = ['Podgląd', 'Styl', 'Ruch', 'Dymki', 'Tak wygląda w pasku', 'Osobno dla agentów'].map(x => html.indexOf(`<h3>${x}</h3>`));
    expect(at.every(i => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).not.toContain('class="segmented"');
    expect(html).not.toContain('class="chips"');
    expect(html).toMatch(/aria-label="Słuchają muzyki"/);
  });
  it('the diagnostics tab offers to report a problem on GitHub, only when it can open it', () => {
    const view = (onReport?: () => void) => renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="diag"
      onTab={() => {}} onChange={() => {}} onIntegration={async () => ''} message={null} onReport={onReport} />);
    expect(view(() => {})).toContain('Zgłoś problem</button>');
    expect(view(() => {})).toContain('wklej go do formularza');
    expect(view()).not.toContain('Zgłoś problem');
  });
  it('lists the apps with their integration state', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('Hooki: brak');
    expect(html).toContain('Agent Router');
    expect(html).toContain('opencode');
    expect(html).toContain('Plugin: brak');
  });
  it('Copilot, Antigravity, Cursor, Grok and ZCode sit under Eksperymentalne, after the main agents; the new three say what they write and what they cannot show', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={newRows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    const at = (x: string) => html.indexOf(x);
    expect(at('Główne agenty')).toBeGreaterThan(-1);
    expect(at('Claude Code')).toBeLessThan(at('Eksperymentalne'));
    expect(at('opencode')).toBeLessThan(at('Eksperymentalne'));
    for (const name of ['GitHub Copilot', 'Antigravity', 'Cursor', 'Grok Build', 'ZCode']) expect(at(name)).toBeGreaterThan(at('Eksperymentalne'));
    expect(at('Eksperymentalne')).toBeLessThan(at('Furtka dla innych agentów'));
    expect(html).not.toContain('class="badge"');
    for (const path of ['~/.cursor/hooks.json', '~/.grok/hooks/agent-pets.json', '~/.zcode/cli/config.json']) expect(html).toContain(path);
    const only = renderToString(<SettingsView settings={defaultSettings()} rows={[found('cursor'), found('zcode')]} diag={diag} tab="apps"
      onTab={() => {}} onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(only).toContain('czeka na Ciebie');
    expect(only).toContain('nie zgłasza błędów');
    setLang('en');
    const en = renderToString(<SettingsView settings={defaultSettings()} rows={newRows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(en).toContain('Experimental');
    expect(en).toContain('Main agents');
  });
  it('an app row shows one status line, keeps its path and hint under Details, dims when not detected and offers Reinstall when hooks are missing', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('Wykryto · Hooki: brak');
    expect(html).toContain('Szczegóły');
    expect(html).toContain('C:/h/.claude');
    expect(html).toContain('Zainstaluj ponownie');
    expect(html).toMatch(/class="ui-row dim"/);
    expect(html).toContain('Nie znaleziono ~/.codex.');
  });
  it('Copilot and Antigravity say what they write and where; Antigravity says what it cannot show', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('>GitHub Copilot<');
    expect(html).toContain('~/.copilot/hooks/agent-pets.json');
    expect(html).toContain('~/.gemini/config/hooks.json');
    expect(html).toContain('czeka na Ciebie');
    expect(html).toMatch(/aria-label="GitHub Copilot"(?![^>]*checked="")/);
  });
  it('the apps tab has the door switch, on for a 0.9.1 file', () => {
    const old = { ...defaultSettings(), apps: { claude_code: true, codex: true, agent_router: true } } as unknown as Settings;
    const html = renderToString(<SettingsView settings={old} rows={rows} diag={diag} tab="apps" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toMatch(/aria-label="Furtka dla innych agentów"[^>]*checked=""/);
    expect(html).toContain('hook.exe report');
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
  it('panel: a door agent name is text, never markup, and a program gets its icon', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const sess = { id: 'generic:kilo:a', agent: 'other' as const, agent_name: evil, origin: 'cli' as const, title: evil, cwd: '', state: 'working' as const,
      tool: 'bash' as const, progress: null, context: null, started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null,
      jump: { pid: null, session_id: 'generic:kilo:a', cwd: '', app: 'vscode' as const } };
    const html = renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0} status={null} focusId={null}
      onJump={() => {}} onSettings={() => {}} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toMatch(/<svg[^>]*class="host-icon"/);
  });
  it('look tab: pick which pet the previews show', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toContain('aria-label="Zwierzak w podglądzie"');
    for (const name of ['Claude Code', 'Codex', 'opencode', 'Inny agent']) expect(html).toContain(`>${name}</button>`);
    expect(html).toMatch(/aria-checked="true"[^>]*>Claude Code<\/button>/);
  });
  it('look tab: previews the bubbles in the chosen style', () => {
    const html = renderToString(<SettingsView settings={defaultSettings()} rows={rows} diag={diag} tab="look" onTab={() => {}}
      onChange={() => {}} onIntegration={async () => ''} message={null} />);
    expect(html).toMatch(/<canvas[^>]*class="bubble-preview"/);
    expect(html).toContain('Dymki');
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
    expect(html).toMatch(/>Sesje<span class="n">1</);
    for (const t of ['Znajdź testy', 'Newton', 'Policz pliki', 'Czyta a.rs', 'utknęło']) expect(html, t).toContain(t);
    expect(html.match(/class="kid[ "]/g)?.length).toBe(3);
    expect(html).toMatch(/class="kid[^"]*focus/);
    expect(html.indexOf('Znajdź testy')).toBeLessThan(html.indexOf('Newton'));
  });
});
