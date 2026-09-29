import { badgeTooltip, limitsTooltip, petTooltip } from '../tooltip/text';
import type { Media, PointerMsg, Session, Snapshot, TooltipContent } from '../types';
import type { Bridge } from './bridge';
import { clickAction, hitTest, menuTarget } from './hit';
import type { LayoutOut } from './layout';

/** `media`: only when the user allows pets to react to music */
interface View { out: LayoutOut; snap: Snapshot; height: number; nowMs: number; media?: Media | null }

/** Hover tooltip; content refreshes each second (time since last activity). */
export class Hover {
  private x = -1;
  private y = -1;
  private key = '';
  private sentAt = 0;

  constructor(private bridge: Bridge, private view: () => View) {}

  pointer(p: PointerMsg): void {
    if (p.kind === 'leave') { this.clear(); return; }
    if (p.kind === 'move') { this.x = p.x; this.y = p.y; this.refresh(); }
    if (p.kind === 'context') {
      const { out, height } = this.view();
      const t = hitTest(out, p.x, p.y, height);
      this.clear();
      this.bridge.openMenu?.(menuTarget(t), p.x, p.y);
      return;
    }
    if (p.kind === 'click') {
      const { out, height } = this.view();
      const a = clickAction(hitTest(out, p.x, p.y, height));
      if (a) { this.clear(); this.bridge.openPanel(a.focus ?? undefined); }
    }
  }

  refresh(force = false): void {
    if (this.x < 0) return;
    const { out, snap, height, nowMs, media } = this.view();
    const t = hitTest(out, this.x, this.y, height);
    if (!t) { this.hide(); return; }
    const key = t.kind === 'pet' || t.kind === 'mini' ? `pet:${t.id}` : t.kind;
    if (!force && key === this.key && Date.now() - this.sentAt < 1000) return;
    let content: TooltipContent;
    if (t.kind === 'pet' || t.kind === 'mini') {
      const s = snap.sessions.find(v => v.id === t.id);
      if (!s) { this.hide(); return; }
      content = petTooltip(s, nowMs, media);
    } else if (t.kind === 'limits') {
      content = limitsTooltip(snap.limits, nowMs);
    } else {
      const hidden = out.hiddenIds.map(id => snap.sessions.find(v => v.id === id)).filter((v): v is Session => !!v);
      content = badgeTooltip(hidden);
    }
    this.key = key;
    this.sentAt = Date.now();
    this.bridge.showTooltip(t.x, content, t.kind === 'pet' || t.kind === 'mini' ? t.id : undefined);
  }

  clear(): void { this.x = this.y = -1; this.hide(); }

  private hide(): void {
    if (!this.key) return;
    this.key = '';
    this.bridge.hideTooltip();
  }
}
