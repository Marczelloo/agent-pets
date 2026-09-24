import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from './App';
import type { Session } from '../types';

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
  it('shows the jump result in the status line', () => {
    const html = renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0}
      status="Skopiowano komendę: claude --resume a" focusId={null} onJump={() => {}} />);
    expect(html).toContain('Skopiowano komendę: claude --resume a');
  });
});
