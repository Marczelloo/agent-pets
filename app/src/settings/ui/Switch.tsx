/** A real checkbox (keyboard and screen reader friendly) drawn as a flat switch. */
export function Switch({ checked, onChange, disabled, 'aria-label': label }: { checked: boolean; onChange: (on: boolean) => void; 'aria-label': string; disabled?: boolean }) {
  return <input type="checkbox" className="ui-switch" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />;
}
