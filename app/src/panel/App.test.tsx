import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from './App';
import type { Session, UpdateStatus } from '../types';

const sess: Session = {
  id: 'a', agent: 'claude', origin: 'cli', title: '<img src=x onerror=alert(1)>', cwd: 'C:\\work\\a', state: 'needs_you',
  tool: null, progress: null, context: null, started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null,
  jump: { pid: null, session_id: 'a', cwd: '', app: null },
};

describe('PanelView', () => {
  it('escapes prompt text and shows a jump button per session', () => {
    const html = renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} />);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('Przejdź');
    expect(html).toContain('Czeka na Ciebie');
  });
  it('has an empty state and says when limits are unknown', () => {
    const html = renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} />);
    expect(html).toContain('Brak aktywnych sesji');
    expect(html).toContain('brak danych');
    expect(html).not.toContain('0%');
  });
  it('draws no pets while the panel is hidden', () => {
    const view = (animate: boolean) => renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} animate={animate} />);
    expect(view(true)).toContain('<canvas');
    expect(view(false)).not.toContain('<canvas');
  });
  it('shows the jump result in the status line', () => {
    const html = renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0}
      status="Skopiowano komendę: claude --resume a" focusId={null} onJump={() => {}} />);
    expect(html).toContain('Skopiowano komendę: claude --resume a');
  });
  it('shows an available update with an install button, and nothing when up to date', () => {
    const view = (update: UpdateStatus) => renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} update={update} onInstall={() => {}} />);
    const av = view({ state: 'available', version: '0.7.1', notes: null });
    expect(av).toContain('Dostępna wersja 0.7.1');
    expect(av).toContain('Zainstaluj');
    const dl = view({ state: 'downloading', version: '0.7.1', pct: 40 });
    expect(dl).toContain('role="progressbar"');
    expect(dl).toContain('aria-valuenow="40"');
    expect(view({ state: 'ready', version: '0.7.1' })).toContain('Zainstaluj teraz');
    for (const u of [{ state: 'idle' }, { state: 'latest' }, { state: 'checking' }] as UpdateStatus[]) expect(view(u)).not.toContain('class="update');
    // błąd ręcznego sprawdzenia należy do ustawień; w panelu tylko problem z samą aktualizacją
    expect(view({ state: 'error', message: 'Błąd sprawdzania aktualizacji', verify: false })).not.toContain('class="update');
    expect(view({ state: 'error', message: 'Nie udało się zweryfikować aktualizacji', verify: true })).toContain('Nie udało się zweryfikować');
  });
  it('each session has a labelled remove button; "remove inactive" is off when nothing is inactive', () => {
    const view = (sessions: Session[]) => renderToString(<PanelView snap={{ sessions, limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} onDismiss={() => {}} onDismissInactive={() => {}} />);
    const busy = view([{ ...sess, title: 'Refaktor', state: 'working' }]);
    expect(busy).toContain('aria-label="Usuń z paska: Refaktor"');
    expect(busy).toMatch(/disabled=""[^>]*>Usuń nieaktywne/);
    const idle = view([{ ...sess, state: 'idle' }]);
    expect(idle).not.toMatch(/disabled=""[^>]*>Usuń nieaktywne/);
  });
  it('subagents sit in the parent card as a tree: title, labels, action and running time', () => {
    const parent: Session = { ...sess, id: 'p', title: 'Rodzic', state: 'working' };
    const kid: Session = { ...sess, id: 'p/a', parent: 'p', title: 'Znajdź testy', state: 'working', started_at: 0,
      action: 'Szukanie: bubble', sub: { kind: 'claude', agent_type: 'Explore', description: 'Znajdź testy', background: true } };
    const view = (animate: boolean) => renderToString(<PanelView snap={{ sessions: [parent, kid], limits: [], now: 0 }} nowMs={72_000}
      status={null} focusId={null} onJump={() => {}} animate={animate} />);
    const html = view(false);
    expect(html).toMatch(/class="group"[\s\S]*class="session[\s\S]*class="kids"[\s\S]*id="s-p\/a"/);
    expect(html).toContain('1 subagent');
    for (const x of ['Znajdź testy', 'Explore', 'w tle', 'Szukanie: bubble', '1:12']) expect(html).toContain(x);
    expect(html).not.toContain('<canvas');
    expect(view(true).match(/<canvas/g)?.length, 'rodzic i mini-zwierzak dziecka').toBe(2);
    expect(view(true)).toContain('class="pet mini"');
  });
  it('after removing, offers undo with the count', () => {
    const view = (n: number) => renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} undo={{ ids: Array.from({ length: n }, (_, i) => `s${i}`) }} onUndo={() => {}} />);
    expect(view(1)).toContain('Usunięto');
    expect(view(1)).toContain('Cofnij');
    expect(view(3)).toContain('Usunięto 3');
    expect(view(0)).not.toContain('Cofnij');
  });
});
