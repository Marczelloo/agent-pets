// Które dymki pokazać teraz (spec 0.8, 2.1): pytanie każdej czekającej sesji, a gdy nikt nie czeka,
// najwyżej jeden dymek z nową akcją na 3 s. Tylko zwierzaki widoczne na scenie, nigdy dzieci.
import { t } from '../i18n';
import type { BubbleKind } from '../renderer/bubble';
import type { Look, Session, Snapshot } from '../types';

export interface BubbleWant { id: string; kind: BubbleKind; text: string; /** środek zwierzaka, px CSS sceny */ x: number; look: Look }
export interface BubbleSwitches { questions: boolean; actions: boolean }

export class Picker {
  /** ostatni widziany tekst akcji każdej sesji (ta sama akcja po sobie nie daje nowego dymka) */
  private seen = new Map<string, string | null>();
  private current: { id: string; text: string; until: number } | null = null;
  private primed = false;

  constructor(private readonly ms = 3000) {}

  update(snap: Snapshot, pets: { id: string; x: number }[], looks: (s: Session) => Look, on: BubbleSwitches, now: number): BubbleWant[] {
    const at = new Map(pets.map(p => [p.id, p.x]));
    const own = snap.sessions.filter(s => !s.parent);
    // nowe akcje: najnowsza zastępuje poprzedni dymek; przy starcie tylko zapamiętujemy stan
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
      for (const s of waiting) out.push({ id: s.id, kind: 'question', text: s.question || t().state.needs_you, x: at.get(s.id)!, look: looks(s) });
    }
    const c = this.current;
    if (c && now >= c.until) this.current = null;
    if (on.actions && this.current && waiting.length === 0) {
      const s = own.find(v => v.id === this.current!.id);
      if (s && at.has(s.id)) out.push({ id: s.id, kind: 'action', text: this.current.text, x: at.get(s.id)!, look: looks(s) });
    }
    return out;
  }
}
