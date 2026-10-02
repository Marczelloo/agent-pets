import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PanelView } from './App';
import type { NotificationEntry, Session, UpdateStatus } from '../types';

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
    expect(html).toMatch(/<button[^>]*class="title open"[^>]*aria-label="Przejdź: /);
    expect(html).toContain('Czeka na Ciebie');
  });
  it('shows what the agent asks on a waiting card, escaped, and nowhere else', () => {
    const view = (x: Session) => renderToString(<PanelView snap={{ sessions: [x], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} animate={false} />);
    const asking = view({ ...sess, question: 'Allow <b>Bash</b>?' });
    expect(asking).toContain('class="question"');
    expect(asking).toContain('Allow &lt;b&gt;Bash&lt;/b&gt;?');
    expect(view({ ...sess, state: 'working', question: 'stale' })).not.toContain('class="question"');
  });
  it('an opencode card shows its tokens and the bars of its account; a Claude card has neither', () => {
    const oc: Session = { ...sess, id: 'opencode:o', agent: 'opencode', state: 'working', title: 'oc',
      usage: { tokens: 1_200_000, cost: 0, account: 'codex' } };
    const snap = { sessions: [oc, { ...sess, id: 'c', title: 'cl' }], now: 0,
      limits: [{ agent: 'codex' as const, window: 'weekly' as const, used_pct: 64, resets_at: null }],
      agent_usage: [{ agent: 'opencode' as const, tokens_today: 4_800_000, cost_today: 0 }] };
    const html = renderToString(<PanelView snap={snap} nowMs={0} status={null} focusId={null} onJump={() => {}} animate={false} />);
    expect(html).toContain('sesja: 1,2 mln tok. · dziś: 4,8 mln tok.');
    expect(html.match(/class="usage"/g)?.length).toBe(1);
    expect(html).toMatch(/class="account"[\s\S]*64%/);
    expect(html.match(/class="account"/g)?.length).toBe(1);
  });
  it('marks cards of experimental agents, not the others', () => {
    const cp: Session = { ...sess, id: 'copilot:p', agent: 'copilot', title: 'cp' };
    const html = renderToString(<PanelView snap={{ sessions: [cp, { ...sess, id: 'c', title: 'cl' }], limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} animate={false} />);
    expect(html.match(/class="exp"/g)?.length).toBe(1);
    expect(html).toMatch(/class="exp"[^>]*>eksperymentalne</);
  });
  it('has an empty state with a hint, and the limits tab says when limits are unknown', () => {
    const view = (initialTab?: 'limits') => renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} initialTab={initialTab} />);
    expect(view()).toContain('Brak aktywnych sesji');
    expect(view()).toContain('Pojawią się tu');
    const limits = view('limits');
    expect(limits).toContain('brak danych');
    expect(limits).not.toContain('0%');
    expect(limits).not.toContain('Brak aktywnych sesji');
  });
  it('has Sessions and Limits tabs with the active-session count; the limits tab hides the sessions', () => {
    const view = (initialTab?: 'limits') => renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} animate={false} initialTab={initialTab} />);
    const html = view();
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>Sesje<span class="n">1</);
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*>Limity</);
    expect(html).toContain('class="session ');
    const limits = view('limits');
    expect(limits).toMatch(/role="tab" aria-selected="true"[^>]*>Limity</);
    expect(limits).not.toContain('class="session ');
  });
  it('shows an alert dot on the Limits tab when an account is nearly out', () => {
    const view = (pct: number) => renderToString(<PanelView snap={{ sessions: [], now: 0,
      limits: [{ agent: 'claude' as const, window: 'five_hour' as const, used_pct: pct, resets_at: 3_600_000 }] }} nowMs={0} status={null} focusId={null} onJump={() => {}} />);
    expect(view(95)).toContain('class="alert-dot"');
    expect(view(20)).not.toContain('alert-dot');
  });
  it('limits tab: one card per agent with its bars', () => {
    const html = renderToString(<PanelView snap={{ sessions: [], now: 0,
      limits: [{ agent: 'claude' as const, window: 'weekly' as const, used_pct: 64, resets_at: null }] }} nowMs={0} status={null} focusId={null} onJump={() => {}} initialTab="limits" />);
    expect(html).toContain('class="lcard');
    expect(html).toContain('64%');
  });
  it('a session card shows a context bar only when the context is known', () => {
    const view = (context: Session['context']) => renderToString(<PanelView snap={{ sessions: [{ ...sess, context }], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} animate={false} />);
    expect(view(null)).not.toContain('class="ctx"');
    expect(view({ used: 50_000, max: 200_000 })).toMatch(/class="ctx"[^>]*width:25%/);
  });
  it('exposes the context bar to assistive tech as a meter, not only as a tooltip', () => {
    const html = renderToString(<PanelView snap={{ sessions: [{ ...sess, context: { used: 50_000, max: 200_000 } }], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} animate={false} />);
    expect(html).toMatch(/class="ctx"[^>]*role="meter"/);
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toMatch(/aria-valuetext="[^"]+"/);
  });
  it('tabs use a roving tabindex: only the selected tab is reachable with Tab', () => {
    const html = renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} animate={false} />);
    expect(html).toMatch(/aria-selected="true" tabindex="0"[^>]*>Sesje/);
    expect(html).toMatch(/aria-selected="false" tabindex="-1"[^>]*>Limity/);
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
    // manual check errors belong in settings; the panel shows only problems with the update itself
    expect(view({ state: 'error', message: 'Błąd sprawdzania aktualizacji', verify: false })).not.toContain('class="update');
    expect(view({ state: 'error', message: 'Nie udało się zweryfikować aktualizacji', verify: true })).toContain('Nie udało się zweryfikować');
  });
  it('each card has a labelled ⋯ menu button (collapsed); "clear inactive" shows only when something is inactive', () => {
    const view = (sessions: Session[]) => renderToString(<PanelView snap={{ sessions, limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} onDismiss={() => {}} onDismissInactive={() => {}} />);
    const busy = view([{ ...sess, title: 'Refaktor', state: 'working' }]);
    expect(busy).toMatch(/aria-label="Więcej: Refaktor" aria-haspopup="menu" aria-expanded="false"/);
    expect(busy).not.toContain('role="menu"');
    expect(busy).not.toContain('Wyczyść nieaktywne');
    expect(view([{ ...sess, state: 'idle' }])).toContain('Wyczyść nieaktywne');
  });
  it('more than three subagents collapse behind a "+N" toggle', () => {
    const parent: Session = { ...sess, id: 'p', title: 'Rodzic', state: 'working' };
    const kids = Array.from({ length: 5 }, (_, i): Session => ({ ...sess, id: `p/${i}`, parent: 'p', title: `Kid${i}`, state: 'working', started_at: 0 }));
    const html = renderToString(<PanelView snap={{ sessions: [parent, ...kids], limits: [], now: 0 }} nowMs={1000} status={null} focusId={null} onJump={() => {}} animate={false} />);
    expect(html.match(/class="kid[ "]/g)?.length).toBe(3);
    expect(html).toContain('+2 subagenty');
    expect(html).toContain('aria-expanded="false">+2');
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
  it('has a statistics button next to settings', () => {
    const html = renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0} status={null} focusId={null}
      onJump={() => {}} onSettings={() => {}} onStats={() => {}} />);
    expect(html).toMatch(/aria-label="Statystyki"[^>]*><svg/);
    expect(html).toMatch(/aria-label="Ustawienia"[^>]*><svg/);
    expect(html).not.toMatch(/[📊⚙]/u);
  });
  it('after removing, offers undo with the count', () => {
    const view = (n: number) => renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0}
      status={null} focusId={null} onJump={() => {}} undo={{ ids: Array.from({ length: n }, (_, i) => `s${i}`) }} onUndo={() => {}} />);
    expect(view(1)).toContain('Usunięto');
    expect(view(1)).toContain('Cofnij');
    expect(view(3)).toContain('Usunięto 3');
    expect(view(0)).not.toContain('Cofnij');
  });
  describe('notification center', () => {
    const note = (o: Partial<NotificationEntry>): NotificationEntry => ({ id: 1, kind: 'update', title: 'Dostępna wersja 1.2.3', body: '', session_id: null, at: 0, read: false, ...o });
    const view = (n: NotificationEntry[], open = false) => renderToString(<PanelView snap={{ sessions: [sess], limits: [], now: 0 }} nowMs={60_000} status={null}
      focusId={null} onJump={() => {}} animate={false} notifications={n} notificationsOpen={open} onNotificationsSeen={() => {}} onNotificationRemove={() => {}} onNotificationsClear={() => {}} onNotificationOpen={() => {}} />);
    it('shows a bell with the unread count', () => {
      const html = view([note({ id: 1 }), note({ id: 2, read: true }), note({ id: 3, kind: 'needs_you', session_id: 'a' })]);
      expect(html).toMatch(/class="badge"[^>]*>2</);
      expect(html).not.toContain('class="inbox"');
    });
    it('lists agent events and updates when open, escaping their text', () => {
      const html = view([note({ id: 1, title: '<b>x</b>' }), note({ id: 2, kind: 'needs_you', session_id: 'a', title: 'Claude czeka' })], true);
      expect(html).toContain('class="inbox"');
      expect(html).toContain('&lt;b&gt;x');
      expect(html).not.toContain('<b>x');
      expect(html).toContain('Czeka na Ciebie');
      expect(html).toContain('Aktualizacja');
      expect(html).toContain('Wyczyść wszystko');
      expect(html).not.toContain('class="limits"');
    });
    it('has an empty state and no bell without a handler', () => {
      expect(view([], true)).toContain('Brak powiadomień');
      const plain = renderToString(<PanelView snap={{ sessions: [], limits: [], now: 0 }} nowMs={0} status={null} focusId={null} onJump={() => {}} />);
      expect(plain).not.toContain('class="badge"');
      expect(plain).not.toContain('bell');
    });
  });
});
