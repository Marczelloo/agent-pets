import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoLimits, demoSessions } from '../stage/demo';
import App, { PanelView } from './App';
import { t } from '../i18n';

/** Podgląd w zwykłej przeglądarce (`pnpm dev`, /panel.html): dane pokazowe zamiast rdzenia. */
function Demo() {
  const [now, setNow] = useState(Date.now());
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const snap = { sessions: demoSessions(5, now), limits: demoLimits(now).slice(1), now };
  return <PanelView snap={snap} nowMs={now} status={status} focusId={null} onJump={id => setStatus(t().panel.copiedCommand(id))} />;
}

createRoot(document.getElementById('root')!).render('__TAURI_INTERNALS__' in window ? <App /> : <Demo />);
