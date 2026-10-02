import type { ReactNode } from 'react';
import { radioKeys } from './radio';

/** A short fixed choice as a pill group; the selected option is raised. Arrow keys move and select. */
export function Segmented<T extends string>({ value, options, onChange, 'aria-label': label }: {
  value: T; options: { value: T; label?: string; icon?: ReactNode; title?: string }[]; onChange: (v: T) => void; 'aria-label': string;
}) {
  const values = options.map(o => o.value);
  return (
    <div className="ui-seg" role="radiogroup" aria-label={label} onKeyDown={e => radioKeys(e, values, value, onChange)}>
      {options.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? 'on' : ''} title={o.title} aria-label={o.label ? undefined : o.title} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
