import type { ReactNode } from 'react';
import { radioKeys } from './radio';

/** A few visual alternatives as cards (optional preview on top); same radiogroup semantics as Segmented. */
export function OptionCards<T extends string>({ value, options, onChange, 'aria-label': label }: {
  value: T; options: { value: T; label: string; hint?: string; preview?: ReactNode }[]; onChange: (v: T) => void; 'aria-label': string;
}) {
  const values = options.map(o => o.value);
  return (
    <div className="ui-cards" role="radiogroup" aria-label={label} onKeyDown={e => radioKeys(e, values, value, onChange)}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          className={`ui-card${o.value === value ? ' on' : ''}`} onClick={() => onChange(o.value)}>
          {o.preview && <span className="ui-card-preview" aria-hidden="true">{o.preview}</span>}
          <span className="ui-card-label">{o.label}</span>
          {o.hint && <span className="ui-card-hint">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}
