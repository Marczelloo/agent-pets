import type { Session, StageOrder, State } from '../types';

/** After this many ms in a new group, the session moves (pets do not jump at every state change). */
export const SETTLE_MS = 3000;

const GROUP: Record<State, number> = {
  needs_you: 0, error: 0, working: 1, thinking: 1, compacting: 1, done: 2, idle: 3, sleep: 3, ended: 3,
};

const agentRank = (s: Session) => (s.origin === 'router' ? 2 : s.agent === 'codex' ? 1 : 0);
const byStart = (a: Session, b: Session) => a.started_at - b.started_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Pet order on stage by setting; `attention` uses `SETTLE_MS` hysteresis. */
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

  /** Drawing order from the left. */
  display(v: Session[], now: number): Session[] {
    const r = this.rank(v, now);
    return [...v].sort((a, b) => r.get(a.id)! - r.get(b.id)! || byStart(a, b));
  }

  /**
   * Order for collapsing into "+N": most important last (they stay visible). With `attention`, use the group;
   * with `start` and `agent`, as in 0.6: the newest stay.
   */
  priority(v: Session[], now: number): Session[] {
    if (this.mode !== 'attention') return [...v].sort(byStart);
    const r = this.rank(v, now);
    return [...v].sort((a, b) => r.get(b.id)! - r.get(a.id)! || byStart(a, b));
  }
}
