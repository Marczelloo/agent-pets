import { describe, expect, it } from 'vitest';
import { clickAction, hitTest, menuTarget, passthroughAt } from './hit';
import { LEFT_REACH, SLOT, geometry, layout, type LayoutOut } from './layout';
import type { Session } from '../types';

const out: LayoutOut = { width: 250, pets: [{ id: 'a', x: 50, minis: [], miniMore: null }, { id: 'b', x: 124, minis: [], miniMore: null }], hidden: 1, hiddenIds: ['z'],
  badgeX: 2, limitsX: 222 };

describe('hitTest', () => {
  it('finds pets by slot, including props on their right', () => {
    expect(hitTest(out, 50, 30, 48)).toEqual({ kind: 'pet', id: 'a', x: 50 });
    expect(hitTest(out, 50 - LEFT_REACH + SLOT - 1, 30, 48)).toEqual({ kind: 'pet', id: 'a', x: 50 });
    expect(hitTest(out, 124 + 30, 30, 48)).toEqual({ kind: 'pet', id: 'b', x: 124 });
  });
  it('finds the badge and the limits', () => {
    expect(hitTest(out, 10, 24, 48)).toEqual({ kind: 'badge', x: 14 });
    expect(hitTest(out, 230, 24, 48)).toEqual({ kind: 'limits', x: 235 });
  });
  it('misses outside the stage', () => {
    expect(hitTest(out, -1, 24, 48)).toBeNull();
    expect(hitTest(out, 251, 24, 48)).toBeNull();
    expect(hitTest(out, 100, 49, 48)).toBeNull();
  });
});

describe('hitTest with stage settings', () => {
  it('hits the middle of every pet at 120 % with a 10 px gap', () => {
    const geo = geometry(1.2, 10, 6);
    const sessions: Session[] = ['a', 'b', 'c'].map((id, i) => ({ id, agent: 'claude', origin: 'cli', title: id, cwd: '', state: 'working',
      tool: null, progress: null, context: null, started_at: i, last_activity: i, state_since: i, turn_started_at: null,
      jump: { pid: null, session_id: id, cwd: '', app: null } }));
    const o = layout({ sessions, hasLimits: true, maxWidth: 2000, geo });
    for (const p of o.pets) expect(hitTest(o, p.x + 5, 30, 48)).toEqual({ kind: 'pet', id: p.id, x: p.x });
    expect(hitTest(o, o.limitsX! + 2, 30, 48)?.kind).toBe('limits');
  });
});

describe('passthroughAt (floating window)', () => {
  it('lets clicks through empty space, but not over a pet, the badge, the limits or a visible background', () => {
    expect(passthroughAt(out, 50, 30, 48, false)).toBe(false);
    expect(passthroughAt(out, 10, 24, 48, false)).toBe(false);
    expect(passthroughAt(out, 240, 5, 48, false)).toBe(false);
    expect(passthroughAt(out, 251, 24, 48, false)).toBe(true);
    const gap: LayoutOut = { ...out, pets: [{ id: 'a', x: 50, minis: [], miniMore: null }], badgeX: null, limitsX: null, width: 250 };
    expect(passthroughAt(gap, 200, 24, 48, false)).toBe(true);
    expect(passthroughAt(gap, 200, 24, 48, true)).toBe(false);
  });
});

describe('clickAction', () => {
  it('opens the panel on the clicked pet, or plain for the badge and the limits', () => {
    expect(clickAction({ kind: 'pet', id: 'a', x: 50 })).toEqual({ focus: 'a' });
    expect(clickAction({ kind: 'badge', x: 14 })).toEqual({ focus: null });
    expect(clickAction({ kind: 'limits', x: 235 })).toEqual({ focus: null });
    expect(clickAction(null)).toBeNull();
  });
});

describe('mini pets', () => {
  const mk = (id: string, parent: string | null = null) => ({
    id, agent: 'claude', origin: 'cli', title: id, cwd: '', state: 'working', tool: 'edit', progress: null, context: null,
    started_at: 0, last_activity: 0, state_since: 0, turn_started_at: null, jump: { pid: null, session_id: id, cwd: '', app: null }, parent,
  }) as Session;
  const all = [mk('p'), mk('a', 'p'), mk('b', 'p')];
  const out = layout({ sessions: all, hasLimits: false, maxWidth: 5000, minisLeft: true,
    minis: p => ({ shown: all.filter(c => c.parent === p.id), more: 0 }) });

  it('a click on a mini opens the panel on that child, a right click is the parent menu', () => {
    const m = out.pets[0].minis[1];
    const t = hitTest(out, m.x, 30, 48);
    expect(t).toEqual({ kind: 'mini', id: 'b', parent: 'p', x: m.x });
    expect(clickAction(t)).toEqual({ focus: 'b' });
    expect(menuTarget(t)).toBe('p');
    expect(hitTest(out, out.pets[0].x, 30, 48)).toMatchObject({ kind: 'pet', id: 'p' });
  });
});
