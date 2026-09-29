// Which bubbles to show now (spec 0.8, 2.1): a question for each waiting session, or when none wait,
// at most one new-action bubble for 3 s. Only pets visible on the stage, never children.
import { t } from '../i18n';
import type { BubbleKind } from '../renderer/bubble';
import type { Look, Session, Snapshot } from '../types';

/** A bubble that appears by itself is short; the full text appears on pet hover. */
export const SHORT_CHARS = 32;
export const shorten = (s: string) => { const c = Array.from(s); return c.length <= SHORT_CHARS ? s : c.slice(0, SHORT_CHARS).join('').trimEnd() + '…'; };

export interface BubbleWant { id: string; kind: BubbleKind; /** short bubble text */ text: string; /** full text (on hover) */ full: string;
  /** pet center, stage CSS px */ x: number; look: Look }
export interface BubbleSwitches { questions: boolean; actions: boolean }

export class Picker {
  /** last action text seen for each session (repeating the same action does not create a new bubble) */
  private seen = new Map<string, string | null>();
  private current: { id: string; text: string; until: number } | null = null;
  private primed = false;

  constructor(private readonly ms = 3000) {}

  update(snap: Snapshot, pets: { id: string; x: number }[], looks: (s: Session) => Look, on: BubbleSwitches, now: number): BubbleWant[] {
    const at = new Map(pets.map(p => [p.id, p.x]));
    const own = snap.sessions.filter(s => !s.parent);
    // new actions: the newest replaces the previous bubble; at startup only remember state
    let fresh: Session | null = null;
    for (const s of own) {
      const a = s.action ?? null;
      if (this.primed && a && this.seen.get(s.id) !== a && at.has(s.id) && (!fresh || s.last_activity > fresh.last_activity)) fresh = s;
      this.seen.set(s.id, a);
    }
    for (const id of [...this.seen.keys()]) if (!own.some(s => s.id === id)) this.seen.delete(id);
    this.primed = true;
    if (fresh) this.current = { id: fresh.id, text: fresh.action!, until: now + this.ms };

    const out: BubbleWant[] = [];
    const waiting = own.filter(s => s.state === 'needs_you' && at.has(s.id));
    if (on.questions) {
      for (const s of waiting) { const q = s.question || t().state.needs_you; out.push({ id: s.id, kind: 'question', text: shorten(q), full: q, x: at.get(s.id)!, look: looks(s) }); }
    }
    const c = this.current;
    if (c && now >= c.until) this.current = null;
    if (on.actions && this.current && waiting.length === 0) {
      const s = own.find(v => v.id === this.current!.id);
      if (s && at.has(s.id)) out.push({ id: s.id, kind: 'action', text: shorten(this.current.text), full: this.current.text, x: at.get(s.id)!, look: looks(s) });
    }
    return out;
  }
}
