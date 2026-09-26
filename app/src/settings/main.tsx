import { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AppId, AppRow, Diagnostics, Settings, SettingsView as View, UpdateStatus } from '../types';
import { defaultSettings } from './model';
import { SettingsView, type Tab } from './SettingsView';
import { Wizard } from './Wizard';
import { setLoopSaving } from './look/loop';
import { setPreviewSaving } from './look/PetsCanvas';
import { resolveLang, setLang, setPreviewLang, setSystemLang, t } from '../i18n';

const inTauri = '__TAURI_INTERNALS__' in window;
if (!inTauri) setPreviewLang();

/** Dane pokazowe dla podglądu w przeglądarce (`pnpm dev`, /settings.html, `?wizard` pokazuje kreator). */
const demoRows: AppRow[] = [
  { id: 'claude_code', detected: { found: true, path: 'C:/Users/ja/.claude', note: null }, status: { installed: true, detail: '' }, enabled: true },
  { id: 'codex', detected: { found: true, path: 'C:/Users/ja/.codex', note: null }, status: { installed: true, detail: '' }, enabled: true },
  { id: 'agent_router', detected: { found: true, path: 'C:/Users/ja/.agent-router', note: null }, status: { installed: true, detail: '' }, enabled: true },
];
const demoDiag: Diagnostics = { version: '0.5.0', endpoint_port: 61234, settings_path: 'C:/Users/ja/.agent-pets/settings.json', settings_error: null,
  hook_exe: 'C:/Users/ja/.agent-pets/hook.exe', autostart_registered: true, last_seen: { claude_code: Date.now() - 20_000, codex: Date.now() - 300_000 },
  apps: [['claude_code', true, ''], ['codex', true, ''], ['agent_router', true, '']] };

function Root() {
  const [view, setView] = useState<View | null>(null);
  const [rows, setRows] = useState<AppRow[]>([]);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [tab, setTab] = useState<Tab>('apps');
  const [message, setMessage] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });

  const reload = useCallback(async () => {
    if (!inTauri) {
      setView({ settings: defaultSettings(), first_run: location.search.includes('wizard'), load_error: null });
      setRows(demoRows.map(r => ({ ...r, status: { ...r.status, detail: r.id === 'claude_code' ? t().demo.hooksInstalled : t().demo.nothingToInstall } })));
      setDiag({ ...demoDiag, apps: demoDiag.apps.map(([id, on]) => [id, on, id === 'claude_code' ? t().demo.hooksInstalled : t().demo.nothingToInstall]) });
      return;
    }
    const [v, r, d] = await Promise.all([invoke<View>('settings_get'), invoke<AppRow[]>('integrations_list'), invoke<Diagnostics>('diagnostics')]);
    setSystemLang(v.system_lang);
    setLang(resolveLang(v.settings.language ?? 'auto'));
    setView(v);
    setRows(r);
    setDiag(d);
    if (v.load_error) setMessage(t().settings.broken(v.load_error));
  }, []);

  useEffect(() => {
    void reload();
    if (!inTauri) return;
    const un = listen<Settings>('pets://settings', e => {
      setLang(resolveLang(e.payload.language ?? 'auto'));
      setView(v => (v ? { ...v, settings: e.payload } : v));
    });
    const power = (s: boolean) => { setLoopSaving(s); setPreviewSaving(s); };
    const unPower = listen<boolean>('pets://power', e => power(e.payload));
    void invoke<boolean>('power_get').then(power);
    const unUpdate = listen<UpdateStatus>('pets://update', e => setUpdate(e.payload));
    void invoke<UpdateStatus>('update_status').then(setUpdate);
    return () => { void un.then(f => f()); void unPower.then(f => f()); void unUpdate.then(f => f()); };
  }, [reload]);

  useEffect(() => { if (tab === 'diag' && inTauri) void invoke<Diagnostics>('diagnostics').then(setDiag); }, [tab]);

  if (!view) return null;

  if (view.first_run) {
    return <Wizard rows={rows} initial={view.settings}
      onFinish={s => (inTauri ? invoke<string[]>('wizard_finish', { settings: s }) : Promise.resolve([t().wizard.demoResult]))}
      onDone={() => void reload().then(() => setView(v => (v ? { ...v, first_run: false } : v)))} />;
  }

  const onChange = (s: Settings) => {
    setLang(resolveLang(s.language ?? 'auto'));
    setView({ ...view, settings: s });
    setMessage(null);
    if (!inTauri) return;
    const relang = s.language !== view.settings.language;
    // opisy integracji i diagnostyka przychodzą z Rusta już w nowym języku
    void invoke('settings_set', { settings: s }).then(() => { if (relang) void reload(); }).catch(e => setMessage(String(e)));
  };
  const onIntegration = async (id: AppId, on: boolean) => {
    if (!inTauri) return '';
    try {
      const m = await invoke<string>('integration_set', { id, on });
      setMessage(m);
      return m;
    } catch (e) {
      setMessage(String(e));
      return String(e);
    } finally {
      await reload();
    }
  };

  return <SettingsView settings={view.settings} rows={rows} diag={diag} tab={tab} onTab={setTab} onChange={onChange}
    onIntegration={onIntegration} message={message} update={update}
    onCheck={() => { if (inTauri) void invoke<UpdateStatus>('update_check').then(setUpdate); else setUpdate({ state: 'latest' }); }} />;
}

createRoot(document.getElementById('root')!).render(<Root />);
