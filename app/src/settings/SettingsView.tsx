import { useState } from 'react';
import type { AppId, AppRow, Diagnostics, Settings } from '../types';
import { APP_HINT, APP_LABEL, clampMaxVisible, reportText } from './model';
import { Toggle } from './Toggle';

export type Tab = 'apps' | 'pets' | 'notify' | 'limits' | 'general' | 'diag';
const TABS: [Tab, string][] = [
  ['apps', 'Aplikacje'], ['pets', 'Zwierzaki'], ['notify', 'Powiadomienia'], ['limits', 'Limity'], ['general', 'Ogólne'], ['diag', 'Diagnostyka'],
];

interface Props {
  settings: Settings;
  rows: AppRow[];
  diag: Diagnostics | null;
  tab: Tab;
  onTab: (t: Tab) => void;
  onChange: (s: Settings) => void;
  onIntegration: (id: AppId, on: boolean) => Promise<string>;
  message: string | null;
}

/** Okno ustawień: zakładki po lewej jak w Ustawieniach Windows 11, zmiany działają od razu. */
export function SettingsView({ settings: s, rows, diag, tab, onTab, onChange, onIntegration, message }: Props) {
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });

  return (
    <div className="settings">
      <nav aria-label="Ustawienia">
        <h1>Agent Pets</h1>
        {TABS.map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined}
            onClick={() => onTab(id)}>{label}</button>
        ))}
      </nav>
      <main>
        <h2>{TABS.find(t => t[0] === tab)?.[1]}</h2>
        {message && <p className="notice" role="status">{message}</p>}

        {tab === 'apps' && <section className="card">
          {rows.map(r => (
            <div key={r.id}>
              <Toggle label={APP_LABEL[r.id]} checked={s.apps[r.id]} disabled={!r.detected.found && !s.apps[r.id]}
                onChange={on => void onIntegration(r.id, on)}>
                {r.detected.found ? `${r.detected.path} · ${r.status.detail}` : r.detected.note}
              </Toggle>
              {r.id === 'claude_code' && s.apps.claude_code && !r.status.installed && (
                <p className="fix">{APP_HINT.claude_code}{' '}
                  <button type="button" onClick={() => void onIntegration(r.id, true)}>Zainstaluj ponownie</button></p>
              )}
            </div>
          ))}
        </section>}

        {tab === 'pets' && <section className="card">
          <div className="row">
            <span className="text"><span className="label">Skórka</span></span>
            <select aria-label="Skórka" value={s.pets.skin} onChange={e => set({ pets: { ...s.pets, skin: e.target.value as Settings['pets']['skin'] } })}>
              <option value="sketch">Szkicowa</option>
              <option value="clean">Czysta</option>
            </select>
          </div>
          <div className="row">
            <span className="text"><span className="label">Najwięcej zwierzaków w pasku</span>
              <span className="desc">Reszta trafia do „+N”; czekające na Ciebie zawsze są widoczne</span></span>
            <input type="number" min={1} max={8} aria-label="Najwięcej zwierzaków w pasku" value={s.pets.max_visible}
              onChange={e => set({ pets: { ...s.pets, max_visible: clampMaxVisible(Number(e.target.value)) } })} />
          </div>
          <div className="row">
            <span className="text"><span className="label">Tryb oszczędny</span>
              <span className="desc">10 klatek na sekundę, animują się tylko pracujące zwierzaki</span></span>
            <select aria-label="Tryb oszczędny" value={s.power_saving} onChange={e => set({ power_saving: e.target.value as Settings['power_saving'] })}>
              <option value="auto">Na baterii</option>
              <option value="always">Zawsze</option>
              <option value="never">Nigdy</option>
            </select>
          </div>
        </section>}

        {tab === 'notify' && <section className="card">
          <Toggle label="Czeka na Ciebie" checked={s.notifications.needs_you}
            onChange={on => set({ notifications: { ...s.notifications, needs_you: on } })}>Gdy agent czeka na odpowiedź dłużej niż 15 s</Toggle>
          <Toggle label="Skończył" checked={s.notifications.done}
            onChange={on => set({ notifications: { ...s.notifications, done: on } })}>Po turze dłuższej niż 2 minuty</Toggle>
          <Toggle label="Limit" checked={s.notifications.limits}
            onChange={on => set({ notifications: { ...s.notifications, limits: on } })}>Gdy zużycie limitu przekroczy 90%</Toggle>
          <p className="desc">Wygląd i dźwięk powiadomień ustawisz w Ustawieniach Windows → System → Powiadomienia → Agent Pets.</p>
        </section>}

        {tab === 'limits' && <section className="card">
          <Toggle label="Limity z Anthropic" checked={s.claude_plan_usage} onChange={on => set({ claude_plan_usage: on })}>
            Co 5 minut pyta api.anthropic.com o zużycie planu Claude, logowaniem Claude Code (~/.claude/.credentials.json).
            Token trafia tylko do api.anthropic.com i nigdzie nie jest zapisywany.
          </Toggle>
        </section>}

        {tab === 'general' && <section className="card">
          <Toggle label="Uruchamiaj z Windows" checked={s.autostart} onChange={on => set({ autostart: on })}>
            Zwierzaki pojawią się po zalogowaniu
          </Toggle>
          <p className="desc">Wersja {diag?.version ?? '–'} · github.com/Marczelloo/agent-pets</p>
        </section>}

        {tab === 'diag' && <section className="card">
          {diag ? <pre className="report">{reportText(diag, Date.now())}</pre> : <p className="desc">Wczytuję…</p>}
          <button type="button" disabled={!diag} onClick={() => {
            if (!diag) return;
            void navigator.clipboard.writeText(reportText(diag, Date.now())).then(() => setCopied(true));
          }}>{copied ? 'Skopiowano' : 'Skopiuj raport'}</button>
        </section>}
      </main>
    </div>
  );
}
