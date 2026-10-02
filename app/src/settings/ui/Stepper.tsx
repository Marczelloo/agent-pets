import { useEffect, useState } from 'react';
import { clampStep } from './clamp';

/** A small integer input without native spin buttons: typed text commits on blur/Enter, the − / + buttons and ArrowUp/Down step. */
export function Stepper({ value, min, max, onChange, 'aria-label': label }: { value: number; min: number; max: number; onChange: (n: number) => void; 'aria-label': string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string | number) => {
    const n = clampStep(raw, min, max, value);
    setDraft(String(n));
    if (n !== value) onChange(n);
  };
  return (
    <span className="ui-stepper">
      <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => commit(value - 1)}>−</button>
      <input type="text" inputMode="numeric" aria-label={label} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commit(draft)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit(draft);
          else if (e.key === 'ArrowUp') { e.preventDefault(); commit(value + 1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); commit(value - 1); }
        }} />
      <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => commit(value + 1)}>+</button>
    </span>
  );
}
