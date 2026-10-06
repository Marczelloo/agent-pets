import type { ReactNode } from 'react';

/** A titled group of rows: a quiet heading, an optional note, no box around it. */
export function Section({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="ui-section">
      {title && <h3>{title}</h3>}
      {note && <p className="ui-note">{note}</p>}
      {children}
    </section>
  );
}
