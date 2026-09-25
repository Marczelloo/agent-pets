/** Przełącznik w stylu Windows 11: prawdziwe pole wyboru (dostępne z klawiatury), podpis i opis pod spodem. */
export function Toggle({ label, checked, disabled, onChange, children }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void; children?: React.ReactNode;
}) {
  return (
    <label className={`row${disabled ? ' off' : ''}`}>
      <span className="text">
        <span className="label">{label}</span>
        {children && <span className="desc">{children}</span>}
      </span>
      <input type="checkbox" className="switch" role="switch" aria-label={label} checked={checked} disabled={disabled}
        onChange={e => onChange(e.target.checked)} />
    </label>
  );
}
