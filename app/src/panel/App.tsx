import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { actionLabel, formatAgo, petTooltip } from '../tooltip/text';
import type { Media, Pets, RouterTask, Settings, SettingsView, Snapshot, UpdateStatus } from '../types';
import { contextText, hasInactive, limitRows, panelSessions, progressText, sessionSubtitle, updateBar } from './model';
import { PetCanvas, setPetSaving } from './PetCanvas';
import { appFor, defaultPets, lookFor } from '../look';
import { isLive, routerHealth, routerLine } from '../stage/router';
import { resolveLang, setLang, setSystemLang, t } from '../i18n';

const routerHot = (t: RouterTask, nowMs: number, seenAt: number) =>
  isLive(t) && ['stalled', 'blocked'].includes(routerHealth(t, nowMs, seenAt));

interface JumpResult { method: string; detail: string }
interface ViewProps {
  snap: Snapshot; nowMs: number; status: string | null; focusId: string | null; onJump: (id: string) => void;
  /** ukryty panel nie rysuje zwierzaków (WebView2 animuje także w ukrytym oknie) */
  animate?: boolean;
  onSettings?: () => void;
  /** wygląd zwierzaków z ustawień (styl, ruch, nadpisania) */
  pets?: Pets;
  update?: UpdateStatus;
  onInstall?: () => void;
  onDismiss?: (ids: string[]) => void;
  onDismissInactive?: () => void;
  /** ostatnio ukryte sesje, do „Cofnij” (znika po 6 s) */
  undo?: { ids: string[] } | null;
  onUndo?: () => void;
  /** co gra w Windows (`null`, gdy zwierzaki nie reagują na muzykę) */
  media?: Media | null;
}

/** Czysty widok panelu: tekst tylko przez JSX (React ucieka znaki), bez `innerHTML`. */
export function PanelView({ snap, nowMs, status, focusId, onJump, animate = true, onSettings, pets = defaultPets(), update, onInstall, onDismiss, onDismissInactive, undo, onUndo, media = null }: ViewProps) {
  const sessions = panelSessions(snap.sessions);
  const bar = updateBar(update);
  return (
    <div className="panel">
      <header>
        <h1>Agent Pets</h1>
        <span className="count">{t().sessions(sessions.length)}</span>
        {onSettings && <button type="button" className="gear" aria-label={t().panel.settings} title={t().panel.settings} onClick={onSettings}>⚙</button>}
      </header>
      {bar && <div className="update" role="status">
        <span className="text">{bar.text}</span>
        {bar.pct != null && <span className="bar" role="progressbar" aria-label={t().panel.update.progress}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar.pct}><i style={{ width: `${bar.pct}%` }} /></span>}
        {bar.action && onInstall && <button type="button" onClick={onInstall}>{bar.action}</button>}
      </div>}
      <section className="limits" aria-label={t().panel.limits}>
        {limitRows(snap.limits, nowMs).map(r => (
          <div className="limit" key={`${r.agent}-${r.window}`}>
            <span className="label">{r.label}</span>
            {r.pct == null ? <span className="none">{t().panel.noData}</span> : <>
              <span className={`bar ${r.agent}`}><i style={{ width: `${r.pct}%` }} className={r.pct >= 90 ? 'hot' : ''} /></span>
              <span className="pct">{Math.round(r.pct)}%</span>
              <span className="reset">{r.reset}</span>
            </>}
          </div>
        ))}
      </section>
      <section className="sessions" aria-label={t().panel.sessions}>
        {onDismissInactive && sessions.length > 0 && <div className="tools">
          <button type="button" className="quiet" disabled={!hasInactive(sessions)} onClick={onDismissInactive}>{t().panel.removeInactive}</button>
        </div>}
        {sessions.length === 0 && <p className="empty">{t().panel.noSessions}</p>}
        {sessions.map(s => (
          <article key={s.id} id={`s-${s.id}`} className={`session ${s.state}${focusId === s.id ? ' focus' : ''}`}>
            {animate ? <PetCanvas session={s} look={lookFor(pets, appFor(s))} music={!!media?.playing} /> : <div className="pet" />}
            <div className="info">
              <div className="title">{petTooltip(s, nowMs).title}</div>
              <div className="sub">{sessionSubtitle(s)}</div>
              <div className="meta">
                <span className="state">{actionLabel(s, media)}</span>
                {progressText(s) && <span>{t().panel.tasks} {progressText(s)}</span>}
                {contextText(s) && <span>{t().panel.context} {contextText(s)}</span>}
                {s.router_task && <span className={routerHot(s.router_task, nowMs, s.last_activity) ? 'router-hot' : undefined}>
                  {routerLine(s.router_task, nowMs, s.last_activity)}</span>}
                <span>{formatAgo(nowMs - s.last_activity)}</span>
              </div>
            </div>
            <div className="actions">
              <button type="button" onClick={() => onJump(s.id)}>{t().panel.open}</button>
              {onDismiss && <button type="button" className="remove" aria-label={t().panel.remove(petTooltip(s, nowMs).title)}
                title={t().panel.remove(petTooltip(s, nowMs).title)} onClick={() => onDismiss([s.id])}>✕</button>}
            </div>
          </article>
        ))}
      </section>
      {undo && undo.ids.length > 0 && <footer className="undo" role="status">
        <span>{t().panel.removed(undo.ids.length)}</span>
        {onUndo && <button type="button" onClick={onUndo}>{t().panel.undo}</button>}
      </footer>}
      {status && <footer className="status" role="status">{status}</footer>}
    </div>
  );
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot>({ sessions: [], limits: [], now: 0 });
  const [pets, setPets] = useState<Pets>(defaultPets);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });
  const [media, setMedia] = useState<Media>({ playing: false, app: null });
  const [undo, setUndo] = useState<{ ids: string[] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const removed = (ids: string[]) => {
    clearTimeout(undoTimer.current);
    setUndo(ids.length ? { ids } : null);
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };
  const [, tick] = useState(0);
  const take = useRef((s: Snapshot) => { setSnap(s); setOffset(s.now - Date.now()); });

  useEffect(() => {
    let unfocus: ReturnType<typeof setTimeout> | undefined;
    const un = [
      listen<Snapshot>('pets://snapshot', e => take.current(e.payload)),
      listen<string>('panel://status', e => setStatus(e.payload)),
      listen<boolean>('panel://visible', e => setShown(e.payload)),
      listen<Settings>('pets://settings', e => { setLang(resolveLang(e.payload.language ?? 'auto')); setPets(e.payload.pets); }),
      listen<boolean>('pets://power', e => setPetSaving(e.payload)),
      listen<UpdateStatus>('pets://update', e => setUpdate(e.payload)),
      listen<Media>('pets://media', e => setMedia(e.payload)),
      listen<string>('panel://focus', e => {
        setStatus(null);
        setFocusId(e.payload);
        requestAnimationFrame(() => document.getElementById(`s-${e.payload}`)?.scrollIntoView({ block: 'nearest' }));
        clearTimeout(unfocus);
        unfocus = setTimeout(() => setFocusId(null), 2000);
      }),
    ];
    void invoke<Snapshot>('snapshot').then(s => take.current(s));
    void invoke<SettingsView>('settings_get').then(v => {
      setSystemLang(v.system_lang);
      setLang(resolveLang(v.settings.language ?? 'auto'));
      setPets(v.settings.pets);
    });
    void invoke<boolean>('power_get').then(saving => setPetSaving(saving));
    void invoke<UpdateStatus>('update_status').then(setUpdate);
    void invoke<Media>('media_get').then(setMedia);
    const t = setInterval(() => tick(n => n + 1), 1000);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') void invoke('panel_hide'); };
    addEventListener('keydown', esc);
    return () => { clearInterval(t); clearTimeout(unfocus); removeEventListener('keydown', esc); un.forEach(p => void p.then(f => f())); };
  }, []);

  const onJump = async (sessionId: string) => {
    const r = await invoke<JumpResult>('jump', { sessionId });
    // udane przejście chowa panel (robi to komenda); schowek i porażkę trzeba przeczytać
    setStatus(r.method === 'clipboard' || r.method === 'none' ? r.detail : null);
  };

  return <PanelView snap={snap} nowMs={Date.now() + offset} status={status} focusId={focusId} onJump={onJump} animate={shown} pets={pets} media={pets.react_to_media !== false ? media : null}
    onSettings={() => void invoke('settings_open')} update={update}
    onInstall={() => void invoke('update_install').catch(e => setStatus(String(e)))}
    onDismiss={ids => void invoke<string[]>('session_dismiss', { ids }).then(removed)}
    onDismissInactive={() => void invoke<string[]>('sessions_dismiss_inactive').then(removed)}
    undo={undo} onUndo={() => { if (undo) void invoke('session_undismiss', { ids: undo.ids }); clearTimeout(undoTimer.current); setUndo(null); }} />;
}
