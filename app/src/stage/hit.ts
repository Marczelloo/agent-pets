import { BADGE_W, LEFT_REACH, LIMITS_W, RIGHT_REACH, SLOT, type LayoutOut } from './layout';

export type Target = { kind: 'pet'; id: string; x: number } | { kind: 'limits'; x: number } | { kind: 'badge'; x: number } | null;

export function hitTest(out: LayoutOut, x: number, y: number, height: number): Target {
  if (x < 0 || x > out.width || y < 0 || y > height) return null;
  if (out.limitsX != null && x >= out.limitsX) return { kind: 'limits', x: out.limitsX + LIMITS_W / 2 };
  if (out.badgeX != null && x >= out.badgeX && x < out.badgeX + BADGE_W) return { kind: 'badge', x: out.badgeX + BADGE_W / 2 };
  for (let i = 0; i < out.pets.length; i++) {
    const p = out.pets[i];
    const left = p.x - LEFT_REACH;
    const right = i + 1 < out.pets.length ? left + SLOT : p.x + RIGHT_REACH;
    if (x >= left && x < right) return { kind: 'pet', id: p.id, x: p.x };
  }
  return null;
}

/** Klik w scenę otwiera panel: na sesji klikniętego zwierzaka albo ogólnie dla „+N” i limitów. */
export function clickAction(t: Target): { focus: string | null } | null {
  if (!t) return null;
  return { focus: t.kind === 'pet' ? t.id : null };
}
