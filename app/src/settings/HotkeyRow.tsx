import { useState } from 'react';
import { t } from '../i18n';
import { prettyAccelerator, recordKey } from './hotkeys';
import { Row } from './ui';

/** One shortcut: a button that records the next combo, plus small "Off" / "Default" buttons; a failed registration shows under the row. */
export function HotkeyRow({ label, hint, value, fallback, error, onChange }: {
  label: string; hint?: string; value: string | null; fallback: string; error?: string | null; onChange: (v: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const h = t().settings.hotkeys;
  const shown = recording ? h.press : value ? prettyAccelerator(value) : h.off;
  return (
    <Row label={label} hint={hint} control={<>
      <button type="button" className={`hotkey${recording ? ' recording' : ''}`} aria-label={`${label}: ${shown}`}
        onClick={() => setRecording(r => !r)} onBlur={() => setRecording(false)}
        onKeyDown={e => {
          if (!recording) return;
          const r = recordKey(e);
          if (r.kind === 'ignore') return;
          e.preventDefault();
          e.stopPropagation();
          setRecording(false);
          if (r.kind === 'set') onChange(r.accelerator);
          if (r.kind === 'clear') onChange(null);
        }}>{shown}</button>
      {value !== fallback && <button type="button" onClick={() => onChange(fallback)}>{h.reset}</button>}
      {value !== null && <button type="button" onClick={() => onChange(null)}>{h.disable}</button>}
    </>}>
      {error && <p className="ui-hint hotkey-error" role="alert">{h.failed}</p>}
    </Row>
  );
}
