import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { actionLabel, formatAgo, formatDuration, petTooltip } from '../tooltip/text';
import type { Media, NotificationEntry, Pets, RouterTask, Session, Settings, SettingsView, Snapshot, UpdateStatus } from '../types';
import { accountRows, childLabels, childLine, childMark, childrenOf, clock, contextText, hasInactive, limitRows, notificationTime, panelSessions, progressText, sessionSubtitle, unreadCount, updateBar, usageLine } from './model';
import { PetCanvas, setPetSaving } from './PetCanvas';
import { BellIcon, GearIcon, StatsIcon } from '../ui/icons';
import { appFor, defaultPets, lookFor } from '../look';
import { isLive, routerHealth, routerLine } from '../stage/router';
import { resolveLang, setLang, setSystemLang, t } from '../i18n';
import { hostLabel } from '../model-label';
import { appBadge } from '../settings/model';
import { HostIcon } from './HostIcon';

const routerHot = (t: RouterTask, nowMs: number, seenAt: number) =>
  isLive(t) && ['stalled', 'blocked'].includes(routerHealth(t, nowMs, seenAt));

interface JumpResult { method: string; detail: string }
interface ViewProps {
  snap: Snapshot; nowMs: number; status: string | null; focusId: string | null; onJump: (id: string) => void;
  /** hidden panel does not draw pets (WebView2 animates even in a hidden window) */
  animate?: boolean;
  onSettings?: () => void;
  onStats?: () => void;
  /** pet appearance from settings (style, motion, overrides) */
  pets?: Pets;
  update?: UpdateStatus;
  onInstall?: () => void;
  onDismiss?: (ids: string[]) => void;
  onDismissInactive?: () => void;
  /** recently hidden sessions for Undo (disappears after 6 s) */
  undo?: { ids: string[] } | null;
  onUndo?: () => void;
  /** what is playing in Windows (`null` when pets do not react to music) */
  media?: Media | null;
  /** notification center (newest first); the bell appears when the handlers are given */
  notifications?: NotificationEntry[];
  /** open the list right away (tests, deep links) */
  notificationsOpen?: boolean;
  onNotificationsSeen?: () => void;
  onNotificationOpen?: (n: NotificationEntry) => void;
  onNotificationRemove?: (id: number) => void;
  onNotificationsClear?: () => void;
}

/** Pure panel view: text through JSX only (React escapes characters), without `innerHTML`. */
export function PanelView({ snap, nowMs, status, focusId, onJump, animate = true, onSettings, onStats, pets = defaultPets(), update, onInstall, onDismiss, onDismissInactive, undo, onUndo, media = null,
  notifications = [], notificationsOpen = false, onNotificationsSeen, onNotificationOpen, onNotificationRemove, onNotificationsClear }: ViewProps) {
  const [inbox, setInbox] = useState(notificationsOpen);
  const unread = unreadCount(notifications);
  const toggleInbox = () => { setInbox(o => !o); if (!inbox && unread > 0) onNotificationsSeen?.(); };
  const sessions = panelSessions(snap.sessions);
  const bar = updateBar(update);
  return (
    <div className="panel">
      <header>
        <h1>Agent Pets</h1>
        <span className="count">{t().sessions(sessions.length)}</span>
        {onNotificationsSeen && <button type="button" className={`gear bell${inbox ? ' on' : ''}`} aria-label={unread ? `${t().panel.notifications.title}: ${t().panel.notifications.unread(unread)}` : t().panel.notifications.title}
          title={t().panel.notifications.title} aria-pressed={inbox} onClick={toggleInbox}>
          <BellIcon />{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>}
        {onStats && <button type="button" className="gear" aria-label={t().panel.stats} title={t().panel.stats} onClick={onStats}><StatsIcon /></button>}
        {onSettings && <button type="button" className="gear" aria-label={t().panel.settings} title={t().panel.settings} onClick={onSettings}><GearIcon /></button>}
      </header>
      {bar && <div className="update" role="status">
        <span className="text">{bar.text}</span>
        {bar.pct != null && <span className="bar" role="progressbar" aria-label={t().panel.update.progress}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={bar.pct}><i style={{ width: `${bar.pct}%` }} /></span>}
        {bar.action && onInstall && <button type="button" onClick={onInstall}>{bar.action}</button>}
      </div>}
      {inbox ? <section className="inbox" aria-label={t().panel.notifications.title}>
        <div className="tools">
          <button type="button" className="quiet" onClick={toggleInbox}>← {t().panel.notifications.back}</button>
          {notifications.length > 0 && onNotificationsClear && <button type="button" className="quiet" onClick={onNotificationsClear}>{t().panel.notifications.clear}</button>}
        </div>
        {notifications.length === 0 && <p className="empty">{t().panel.notifications.empty}</p>}
        <ul>
          {notifications.map(n => (
            <li key={n.id} className={`note ${n.kind}${n.read ? '' : ' unread'}`}>
              <div className="body">
                <div className="line1"><span className="kind">{t().panel.notifications.kind[n.kind]}</span><span className="when">{notificationTime(n.at, nowMs)}</span></div>
                <div className="title">{n.title}</div>
                {n.body && <div className="text">{n.body}</div>}
              </div>
              <div className="actions">
                {onNotificationOpen && (n.session_id || n.kind === 'update') && <button type="button" onClick={() => onNotificationOpen(n)}>{n.kind === 'update' ? t().panel.update.install : t().panel.open}</button>}
                {onNotificationRemove && <button type="button" className="remove" aria-label={t().panel.notifications.remove(n.title)}
                  title={t().panel.notifications.remove(n.title)} onClick={() => onNotificationRemove(n.id)}>✕</button>}
              </div>
            </li>
          ))}
        </ul>
      </section> : <>
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
        {sessions.map(s => { const kids = childrenOf(snap.sessions, s.id, nowMs); return (<div key={s.id} className="group">
          <article id={`s-${s.id}`} className={`session ${s.state}${focusId === s.id ? ' focus' : ''}`}>
            {animate ? <PetCanvas session={s} look={lookFor(pets, appFor(s))} music={!!media?.playing} /> : <div className="pet" />}
            <div className="info">
              <div className="title">{petTooltip(s, nowMs).title}</div>
              <div className="sub">{s.jump.app && hostLabel(s) && <HostIcon app={s.jump.app} />}{sessionSubtitle(s)}</div>
              <div className="meta">
                <span className="state">{actionLabel(s, media)}</span>
                {appBadge(appFor(s)) && <span className="exp">{appBadge(appFor(s))}</span>}
                {kids.length > 0 && <span>{t().panel.subagents(kids.length)}</span>}
                {progressText(s) && <span>{t().panel.tasks} {progressText(s)}</span>}
                {contextText(s) && <span>{t().panel.context} {contextText(s)}</span>}
                {s.router_task && <span className={routerHot(s.router_task, nowMs, s.last_activity) ? 'router-hot' : undefined}>
                  {routerLine(s.router_task, nowMs, s.last_activity)}</span>}
                <span>{formatAgo(nowMs - s.last_activity)}</span>
              </div>
              {usageLine(s, snap.agent_usage?.find(a => a.agent === s.agent)) && <div className="usage">{usageLine(s, snap.agent_usage?.find(a => a.agent === s.agent))}</div>}
              {accountRows(s, snap.limits, nowMs).map(r => (
                <div className="account" key={`${r.agent}-${r.window}`}>
                  <span className="label">{r.label}</span>
                  <span className={`bar ${r.agent}`}><i style={{ width: `${r.pct}%` }} className={(r.pct ?? 0) >= 90 ? 'hot' : ''} /></span>
                  <span className="pct">{Math.round(r.pct ?? 0)}%</span>
                </div>
              ))}
            </div>
            <div className="actions">
              <button type="button" onClick={() => onJump(s.id)}>{t().panel.open}</button>
              {onDismiss && <button type="button" className="remove" aria-label={t().panel.remove(petTooltip(s, nowMs).title)}
                title={t().panel.remove(petTooltip(s, nowMs).title)} onClick={() => onDismiss([s.id])}>✕</button>}
            </div>
          </article>
          {kids.length > 0 && <ul className="kids" aria-label={t().panel.subagents(kids.length)}>
            {kids.map(c => <SubagentRow key={c.id} c={c} nowMs={nowMs} focus={focusId === c.id} animate={animate} pets={pets} />)}
          </ul>}
        </div>); })}
      </section></>}
      {undo && undo.ids.length > 0 && <footer className="undo" role="status">
        <span>{t().panel.removed(undo.ids.length)}</span>
        {onUndo && <button type="button" onClick={onUndo}>{t().panel.undo}</button>}
      </footer>}
      {status && <footer className="status" role="status">{status}</footer>}
    </div>
  );
}

/** Subagent on a parent card: tree branch, mini pet, title with labels, action, and working time. */
function SubagentRow({ c, nowMs, focus, animate, pets }: { c: Session; nowMs: number; focus: boolean; animate: boolean; pets: Pets }) {
  const mark = childMark(c);
  return (
    <li id={`s-${c.id}`} className={`kid ${c.state}${focus ? ' focus' : ''}`}>
      <span className="branch" aria-hidden="true" />
      {animate ? <PetCanvas session={c} look={lookFor(pets, appFor(c))} mini /> : <div className="pet mini" />}
      <div className="body">
        <div className="line1">
          <span className="title">{petTooltip(c, nowMs).title}</span>
          {childLabels(c, nowMs).map(l => <span key={l.kind} className={`chip ${l.kind}`}>{l.text}</span>)}
        </div>
        <div className={`act ${mark}`}><span className="mark" aria-hidden="true">{mark === 'ok' ? '✓' : mark === 'err' ? '!' : ''}</span>{childLine(c)}</div>
      </div>
      <span className="time" title={t().panel.child.runningFor(formatDuration(nowMs - c.started_at))}>{clock(nowMs - c.started_at)}</span>
    </li>
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
  const [notes, setNotes] = useState<NotificationEntry[]>([]);
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
      listen<NotificationEntry[]>('pets://notifications', e => setNotes(e.payload)),
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
    void invoke<NotificationEntry[]>('notifications_list').then(setNotes);
    const t = setInterval(() => tick(n => n + 1), 1000);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') void invoke('panel_hide'); };
    addEventListener('keydown', esc);
    return () => { clearInterval(t); clearTimeout(unfocus); removeEventListener('keydown', esc); un.forEach(p => void p.then(f => f())); };
  }, []);

  const onJump = async (sessionId: string) => {
    const r = await invoke<JumpResult>('jump', { sessionId });
    // successful navigation hides the panel (handled by the command); clipboard and failure need to be read
    setStatus(r.method === 'clipboard' || r.method === 'none' ? r.detail : null);
  };

  return <PanelView snap={snap} nowMs={Date.now() + offset} status={status} focusId={focusId} onJump={onJump} animate={shown} pets={pets} media={pets.react_to_media !== false ? media : null}
    onSettings={() => void invoke('settings_open')} onStats={() => void invoke('stats_open')} update={update}
    onInstall={() => void invoke('update_install').catch(e => setStatus(String(e)))}
    onDismiss={ids => void invoke<string[]>('session_dismiss', { ids }).then(removed)}
    onDismissInactive={() => void invoke<string[]>('sessions_dismiss_inactive').then(removed)}
    notifications={notes} onNotificationsSeen={() => void invoke('notifications_read')}
    onNotificationOpen={n => { if (n.session_id) void onJump(n.session_id); else if (n.kind === 'update') void invoke('update_install').catch(e => setStatus(String(e))); }}
    onNotificationRemove={id => void invoke('notification_remove', { id })} onNotificationsClear={() => void invoke('notifications_clear')}
    undo={undo} onUndo={() => { if (undo) void invoke('session_undismiss', { ids: undo.ids }); clearTimeout(undoTimer.current); setUndo(null); }} />;
}
