import type { ReactNode } from 'react';
import { radioKeys } from './radio';

interface Option<T> { value: T; label?: string; icon?: ReactNode; title?: string; /** marks an option that is running right now but is not the chosen value */ playing?: boolean }

/** A short fixed choice as a pill group; the selected option is raised. Arrow keys move and select.
 *  A value that matches no option leaves the group unselected, with the first option still reachable by Tab. */
export function Segmented<T extends string>({ value, options, onChange, wrap, 'aria-label': label }: {
  value: T; options: Option<T>[]; onChange: (v: T) => void; wrap?: boolean; 'aria-label': string;
}) {
  const values = options.map(o => o.value);
  const chosen = values.includes(value);
  return (
    <div className={wrap ? 'ui-seg wrap' : 'ui-seg'} role="radiogroup" aria-label={label} onKeyDown={e => radioKeys(e, values, value, onChange)}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={(chosen ? o.value === value : i === 0) ? 0 : -1}
          className={o.value === value ? 'on' : o.playing ? 'playing' : undefined} title={o.title} aria-label={o.label ? undefined : o.title} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}
