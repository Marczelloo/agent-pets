import { geometry, LEFT_REACH, MINI_MORE_W, PAD, SLOT, type LayoutOut } from './layout';
import { MINI_SCALE } from './minis';

export type Target = { kind: 'pet'; id: string; x: number } | { kind: 'mini'; id: string; parent: string; x: number }
  | { kind: 'limits'; x: number } | { kind: 'badge'; x: number } | null;

export function hitTest(out: LayoutOut, x: number, y: number, height: number): Target {
  if (x < 0 || x > out.width || y < 0 || y > height) return null;
  const g = out.geo ?? geometry(1, 0, PAD);
  if (out.limitsX != null && x >= out.limitsX) return { kind: 'limits', x: out.limitsX + g.limitsW / 2 };
  if (out.badgeX != null && x >= out.badgeX && x < out.badgeX + g.badgeW) return { kind: 'badge', x: out.badgeX + g.badgeW / 2 };
  const miniSlot = SLOT * g.zoom * MINI_SCALE, ml = LEFT_REACH * g.zoom * MINI_SCALE, half = MINI_MORE_W * g.zoom / 2;
  for (const p of out.pets) {
    for (const m of p.minis) if (x >= m.x - ml && x < m.x - ml + miniSlot) return { kind: 'mini', id: m.id, parent: p.id, x: m.x };
    // children's "+N" belongs to the parent
    if (p.miniMore && x >= p.miniMore.x - half && x < p.miniMore.x + half) return { kind: 'pet', id: p.id, x: p.x };
  }
  for (let i = 0; i < out.pets.length; i++) {
    const p = out.pets[i];
    const left = p.x - g.left;
    const right = i + 1 < out.pets.length ? left + g.slot : p.x + g.right;
    if (x >= left && x < right) return { kind: 'pet', id: p.id, x: p.x };
  }
  return null;
}

/** Floating window: whether the cursor is over empty space (the click should reach the window below). */
export function passthroughAt(out: LayoutOut, x: number, y: number, height: number, hasBg: boolean): boolean {
  if (x < 0 || x > out.width || y < 0 || y > height) return true;
  return !hasBg && hitTest(out, x, y, height) == null;
}

/** Clicking the stage opens the panel: focused on the clicked pet's session (mini: child row), or generally for "+N" and limits. */
export function clickAction(t: Target): { focus: string | null } | null {
  if (!t) return null;
  return { focus: t.kind === 'pet' || t.kind === 'mini' ? t.id : null };
}

/** Right click: pet menu; on a mini, its parent's menu (the child cannot be hidden separately). */
export function menuTarget(t: Target): string | null {
  if (t?.kind === 'pet') return t.id;
  if (t?.kind === 'mini') return t.parent;
  return null;
}
