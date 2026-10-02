import type { ReactNode } from 'react';

/** One setting: label and hint on the left, the control on the right, optional details underneath. */
export function Row({ label, badge, hint, control, dim, children }: { label: string; badge?: string; hint?: ReactNode; control?: ReactNode; dim?: boolean; children?: ReactNode }) {
  return (
    <div className={`ui-row${dim ? ' dim' : ''}`}>
      <div className="ui-row-main">
        <div className="ui-text">
          <span className="ui-label">{label}{badge && <span className="badge">{badge}</span>}</span>
          {hint && <span className="ui-hint">{hint}</span>}
        </div>
        {control && <div className="ui-control">{control}</div>}
      </div>
      {children && <div className="ui-details">{children}</div>}
    </div>
  );
}
