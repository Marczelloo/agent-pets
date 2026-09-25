import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { actionLabel, formatAgo, petTooltip } from '../tooltip/text';
import type { Snapshot } from '../types';
import { contextText, limitRows, panelSessions, progressText, sessionSubtitle } from './model';
import { PetCanvas } from './PetCanvas';
import { isLive, routerHealth, routerLine } from '../stage/router';
import type { RouterTask } from '../types';

const routerHot = (t: RouterTask, nowMs: number, seenAt: number) =>
  isLive(t) && ['stalled', 'blocked'].includes(routerHealth(t, nowMs, seenAt));

interface JumpResult { method: string; detail: string }
interface ViewProps {
  snap: Snapshot; nowMs: number; status: string | null; focusId: string | null; onJump: (id: string) => void;
  /** ukryty panel nie rysuje zwierzaków (WebView2 animuje także w ukrytym oknie) */
  animate?: boolean;
}

const plural = (n: number) =>
  n === 1 ? 'sesja' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'sesje' : 'sesji';

/** Czysty widok panelu: tekst tylko przez JSX (React ucieka znaki), bez `innerHTML`. */
export function PanelView({ snap, nowMs, status, focusId, onJump, animate = true }: ViewProps) {
  const sessions = panelSessions(snap.sessions);
  return (
    <div className="panel">
      <header>
        <h1>Agent Pets</h1>
        <span className="count">{sessions.length} {plural(sessions.length)}</span>
      </header>
      <section className="limits" aria-label="Limity">
        {limitRows(snap.limits, nowMs).map(r => (
          <div className="limit" key={`${r.agent}-${r.window}`}>
            <span className="label">{r.label}</span>
            {r.pct == null ? <span className="none">brak danych</span> : <>
              <span className={`bar ${r.agent}`}><i style={{ width: `${r.pct}%` }} className={r.pct >= 90 ? 'hot' : ''} /></span>
              <span className="pct">{Math.round(r.pct)}%</span>
              <span className="reset">{r.reset}</span>
            </>}
          </div>
        ))}
      </section>
      <section className="sessions" aria-label="Sesje">
        {sessions.length === 0 && <p className="empty">Brak aktywnych sesji</p>}
        {sessions.map(s => (
          <article key={s.id} id={`s-${s.id}`} className={`session ${s.state}${focusId === s.id ? ' focus' : ''}`}>
            {animate ? <PetCanvas session={s} /> : <div className="pet" />}
            <div className="info">
              <div className="title">{petTooltip(s, nowMs).title}</div>
              <div className="sub">{sessionSubtitle(s)}</div>
              <div className="meta">
                <span className="state">{actionLabel(s)}</span>
                {progressText(s) && <span>Zadania {progressText(s)}</span>}
                {contextText(s) && <span>Kontekst {contextText(s)}</span>}
                {s.router_task && <span className={routerHot(s.router_task, nowMs, s.last_activity) ? 'router-hot' : undefined}>
                  {routerLine(s.router_task, nowMs, s.last_activity)}</span>}
                <span>{formatAgo(nowMs - s.last_activity)}</span>
              </div>
            </div>
            <button type="button" onClick={() => onJump(s.id)}>Przejdź</button>
          </article>
        ))}
      </section>
      {status && <footer className="status" role="status">{status}</footer>}
    </div>
  );
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot>({ sessions: [], limits: [], now: 0 });
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [, tick] = useState(0);
  const take = useRef((s: Snapshot) => { setSnap(s); setOffset(s.now - Date.now()); });

  useEffect(() => {
    let unfocus: ReturnType<typeof setTimeout> | undefined;
    const un = [
      listen<Snapshot>('pets://snapshot', e => take.current(e.payload)),
      listen<string>('panel://status', e => setStatus(e.payload)),
      listen<boolean>('panel://visible', e => setShown(e.payload)),
      listen<string>('panel://focus', e => {
        setStatus(null);
        setFocusId(e.payload);
        requestAnimationFrame(() => document.getElementById(`s-${e.payload}`)?.scrollIntoView({ block: 'nearest' }));
        clearTimeout(unfocus);
        unfocus = setTimeout(() => setFocusId(null), 2000);
      }),
    ];
    void invoke<Snapshot>('snapshot').then(s => take.current(s));
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

  return <PanelView snap={snap} nowMs={Date.now() + offset} status={status} focusId={focusId} onJump={onJump} animate={shown} />;
}
