import { useState } from 'react';
import type { AppId, AppRow, Diagnostics, Settings } from '../types';
import { LookTab } from './look/LookTab';
import { appHint, appLabel, clampMaxVisible, reportText } from './model';
import { Toggle } from './Toggle';
import { t } from '../i18n';

export type Tab = 'apps' | 'look' | 'notify' | 'limits' | 'general' | 'diag';
const TABS: Tab[] = ['apps', 'look', 'notify', 'limits', 'general', 'diag'];

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
      <nav aria-label={t().panel.settings}>
        <h1>Agent Pets</h1>
        {TABS.map(id => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined}
            onClick={() => onTab(id)}>{t().settings.tabs[id]}</button>
        ))}
      </nav>
      <main>
        <h2>{t().settings.tabs[tab]}</h2>
        {message && <p className="notice" role="status">{message}</p>}

        {tab === 'apps' && <section className="card">
          {rows.map(r => (
            <div key={r.id}>
              <Toggle label={appLabel(r.id)} checked={s.apps[r.id]} disabled={!r.detected.found && !s.apps[r.id]}
                onChange={on => void onIntegration(r.id, on)}>
                {r.detected.found ? `${r.detected.path} · ${r.status.detail}` : r.detected.note}
              </Toggle>
              {r.id === 'claude_code' && s.apps.claude_code && !r.status.installed && (
                <p className="fix">{appHint('claude_code')}{' '}
                  <button type="button" onClick={() => void onIntegration(r.id, true)}>{t().settings.reinstall}</button></p>
              )}
            </div>
          ))}
        </section>}

        {tab === 'look' && <LookTab pets={s.pets} onChange={p => set({ pets: p })} />}
        {tab === 'look' && <section className="card">
          <div className="row">
            <span className="text"><span className="label">{t().settings.maxVisible}</span>
              <span className="desc">{t().settings.maxVisibleDesc}</span></span>
            <input type="number" min={1} max={8} aria-label={t().settings.maxVisible} value={s.pets.max_visible}
              onChange={e => set({ pets: { ...s.pets, max_visible: clampMaxVisible(Number(e.target.value)) } })} />
          </div>
          <div className="row">
            <span className="text"><span className="label">{t().settings.powerSaving}</span>
              <span className="desc">{t().settings.powerSavingDesc}</span></span>
            <select aria-label={t().settings.powerSaving} value={s.power_saving} onChange={e => set({ power_saving: e.target.value as Settings['power_saving'] })}>
              <option value="auto">{t().settings.power.auto}</option>
              <option value="always">{t().settings.power.always}</option>
              <option value="never">{t().settings.power.never}</option>
            </select>
          </div>
        </section>}

        {tab === 'notify' && <section className="card">
          <Toggle label={t().state.needs_you} checked={s.notifications.needs_you}
            onChange={on => set({ notifications: { ...s.notifications, needs_you: on } })}>{t().settings.notifyNeeds}</Toggle>
          <Toggle label={t().state.done} checked={s.notifications.done}
            onChange={on => set({ notifications: { ...s.notifications, done: on } })}>{t().settings.notifyDone}</Toggle>
          <Toggle label={t().limits.label} checked={s.notifications.limits}
            onChange={on => set({ notifications: { ...s.notifications, limits: on } })}>{t().limits.notification}</Toggle>
          <p className="desc">{t().settings.notifyWindows}</p>
        </section>}

        {tab === 'limits' && <section className="card">
          <Toggle label={t().limits.fromAnthropic} checked={s.claude_plan_usage} onChange={on => set({ claude_plan_usage: on })}>
            {t().limits.usage}
          </Toggle>
        </section>}

        {tab === 'general' && <section className="card">
          <Toggle label={t().settings.autostart} checked={s.autostart} onChange={on => set({ autostart: on })}>
            {t().settings.autostartDesc}
          </Toggle>
          <p className="desc">{t().settings.version(diag?.version ?? '–')}</p>
        </section>}

        {tab === 'diag' && <section className="card">
          {diag ? <pre className="report">{reportText(diag, Date.now())}</pre> : <p className="desc">{t().settings.loading}</p>}
          <button type="button" disabled={!diag} onClick={() => {
            if (!diag) return;
            void navigator.clipboard.writeText(reportText(diag, Date.now())).then(() => setCopied(true));
          }}>{copied ? t().settings.copied : t().settings.copyReport}</button>
        </section>}
      </main>
    </div>
  );
}
