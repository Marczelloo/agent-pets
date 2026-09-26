import type { Session, StageOrder, State } from '../types';

/** Po tylu ms w nowej grupie sesja zmienia miejsce (zwierzaki nie skaczą przy każdej zmianie stanu). */
export const SETTLE_MS = 3000;

const GROUP: Record<State, number> = {
  needs_you: 0, error: 0, working: 1, thinking: 1, compacting: 1, done: 2, idle: 3, sleep: 3, ended: 3,
};

const agentRank = (s: Session) => (s.origin === 'router' ? 2 : s.agent === 'codex' ? 1 : 0);
const byStart = (a: Session, b: Session) => a.started_at - b.started_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Kolejność zwierzaków w scenie według ustawienia; dla `attention` z histerezą `SETTLE_MS`. */
export class Orderer {
  private seen = new Map<string, { shown: number; pending: number | null; at: number }>();

  constructor(private mode: StageOrder) {}

  private group(s: Session, now: number): number {
    const g = GROUP[s.state] ?? 3;
    const r = this.seen.get(s.id);
    if (!r) { this.seen.set(s.id, { shown: g, pending: null, at: now }); return g; }
    if (g === r.shown) { r.pending = null; return g; }
    if (r.pending !== g) { r.pending = g; r.at = now; }
    if (now - r.at >= SETTLE_MS) { r.shown = g; r.pending = null; }
    return r.shown;
  }

  private rank(v: Session[], now: number): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of v) m.set(s.id, this.mode === 'attention' ? this.group(s, now) : this.mode === 'agent' ? agentRank(s) : 0);
    for (const id of [...this.seen.keys()]) if (!m.has(id)) this.seen.delete(id);
    return m;
  }

  /** Kolejność rysowania od lewej. */
  display(v: Session[], now: number): Session[] {
    const r = this.rank(v, now);
    return [...v].sort((a, b) => r.get(a.id)! - r.get(b.id)! || byStart(a, b));
  }

  /**
   * Kolejność do zwijania w „+N”: najważniejsze na końcu (zostają widoczne). Przy `attention` to grupa;
   * przy `start` i `agent` jak w 0.6: najnowsze zostają.
   */
  priority(v: Session[], now: number): Session[] {
    if (this.mode !== 'attention') return [...v].sort(byStart);
    const r = this.rank(v, now);
    return [...v].sort((a, b) => r.get(b.id)! - r.get(a.id)! || byStart(a, b));
  }
}
