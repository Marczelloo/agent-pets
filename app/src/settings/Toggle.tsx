import type { ReactNode } from 'react';
import { Row, Switch } from './ui';

/** A row with a switch; kept for the tabs that have not moved to Row + Switch directly. */
export function Toggle({ label, badge, checked, disabled, nested, onChange, children }: {
  label: string; badge?: string; checked: boolean; disabled?: boolean; nested?: boolean; onChange: (on: boolean) => void; children?: ReactNode;
}) {
  return <Row label={label} badge={badge} hint={children} dim={disabled} nested={nested} control={<Switch aria-label={label} checked={checked} disabled={disabled} onChange={onChange} />} />;
}
