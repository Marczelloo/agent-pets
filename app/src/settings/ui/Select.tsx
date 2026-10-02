/** Native select (full keyboard and OS behaviour) with a drawn chevron. */
export function Select<T extends string>({ value, options, onChange, 'aria-label': label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; 'aria-label': string;
}) {
  return (
    <span className="ui-select">
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}
