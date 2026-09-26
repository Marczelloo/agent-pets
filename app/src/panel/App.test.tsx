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
  });
});
