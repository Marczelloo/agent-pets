import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoChildren, demoLimits, demoSessions } from '../stage/demo';
import App, { PanelView } from './App';
import type { NotificationEntry } from '../types';
import { setPreviewLang, t } from '../i18n';

/** a few inbox entries for the preview (/panel.html#inbox opens the list) */
function demoNotes(now: number): NotificationEntry[] {
  const at = (min: number) => now - min * 60_000;
  return [
    { id: 4, kind: 'limit', title: 'Claude: 5h limit running out', body: 'At this pace it runs out around 15:33, before the 17:20 reset', session_id: null, at: at(3), read: false },
    { id: 3, kind: 'needs_you', title: 'agent-pets needs you', body: 'Claude Code is waiting for permission to run a command', session_id: 'demo-1', at: at(12), read: false },
    { id: 2, kind: 'limit', title: 'Codex: 5h limit running out', body: 'At this pace it runs out around 14:26, before the 17:24 reset', session_id: null, at: at(40), read: true },
    { id: 1, kind: 'done', title: 'website finished', body: 'Codex finished its turn', session_id: 'demo-2', at: at(95), read: true },
  ];
}

/** Preview in a regular browser (`pnpm dev`, /panel.html): demo data instead of core. */
function Demo() {
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const snap = { sessions: [...demoSessions(5, now), ...demoChildren(now)], limits: demoLimits(now).slice(1), now };
  return <PanelView snap={snap} nowMs={now} status={status} focusId={null} onJump={id => setStatus(t().panel.copiedCommand(id))}
    onSettings={() => {}} onStats={() => {}} notifications={demoNotes(now)} notificationsOpen={location.hash === '#inbox'}
    onNotificationsSeen={() => {}} onNotificationOpen={() => {}} onNotificationRemove={() => {}} onNotificationsClear={() => {}} />;
}

if (!('__TAURI_INTERNALS__' in window)) setPreviewLang();
createRoot(document.getElementById('root')!).render('__TAURI_INTERNALS__' in window ? <App /> : <Demo />);
