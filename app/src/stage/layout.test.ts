import { describe, expect, it } from 'vitest';
import type { Session, State } from '../types';
import { BADGE_W, LEFT_REACH, LIMITS_W, PAD, RIGHT_REACH, SLOT, capacity, contentWidth, geometry, layout, pickVisible, zoomOf } from './layout';

const mk = (id: string, started_at: number, state: State = 'working'): Session => ({
  id, agent: 'claude', origin: 'cli', title: id, cwd: '', state, tool: 'edit', progress: null, context: null,
  started_at, last_activity: started_at, state_since: started_at, turn_started_at: null,
  jump: { pid: null, session_id: id, cwd: '', app: null },
});

describe('pickVisible', () => {
  it('shows everything that fits', () => {
    const s = [mk('a', 1), mk('b', 2)];
    expect(pickVisible(s, 5)).toEqual({ visible: s, hidden: 0 });
  });
  it('collapses the oldest first and keeps start order', () => {
    const s = [1, 2, 3, 4, 5, 6, 7].map(i => mk(`s${i}`, i));
    const r = pickVisible(s, 5);
    expect(r.visible.map(v => v.id)).toEqual(['s3', 's4', 's5', 's6', 's7']);
    expect(r.hidden).toBe(2);
  });
  it('never hides needs_you or error', () => {
    const s = [mk('old-needs', 1, 'needs_you'), mk('old-err', 2, 'error'), ...[3, 4, 5, 6, 7].map(i => mk(`s${i}`, i))];
    const ids = pickVisible(s, 5).visible.map(v => v.id);
    expect(ids).toEqual(['old-needs', 'old-err', 's5', 's6', 's7']);
  });
  it('keeps the newest urgent ones when they alone exceed capacity', () => {
    const s = [1, 2, 3].map(i => mk(`n${i}`, i, 'needs_you'));
    expect(pickVisible(s, 2).visible.map(v => v.id)).toEqual(['n2', 'n3']);
  });
  it('capacity 0 hides everything', () => {
    expect(pickVisible([mk('a', 1)], 0)).toEqual({ visible: [], hidden: 1 });
  });
});

describe('layout', () => {
  it('first pet is never clipped on the left and the last fits on the right (spike S1 bug)', () => {
    for (let n = 1; n <= 7; n++) for (const hasLimits of [false, true]) {
      const sessions = Array.from({ length: n }, (_, i) => mk(`s${i}`, i));
      const out = layout({ sessions, hasLimits, maxWidth: 400 });
      expect(out.pets.length).toBeGreaterThan(0);
      expect(out.pets[0].x - LEFT_REACH).toBeGreaterThanOrEqual(0);
      const last = out.pets[out.pets.length - 1];
      expect(last.x + RIGHT_REACH).toBeLessThanOrEqual(out.width - (hasLimits ? LIMITS_W : 0));
      expect(out.width).toBeLessThanOrEqual(400);
    }
  });
  it('width follows content, not a fixed stage size', () => {
    expect(layout({ sessions: [mk('a', 1)], hasLimits: false, maxWidth: 1000 }).width).toBe(contentWidth(1, false, false));
    expect(layout({ sessions: [], hasLimits: false, maxWidth: 1000 }).width).toBe(0);
    expect(layout({ sessions: [], hasLimits: true, maxWidth: 1000 }).width).toBe(contentWidth(0, false, true));
  });
  it('shows at most 5 pets and a +N badge with the hidden ids', () => {
    const sessions = Array.from({ length: 8 }, (_, i) => mk(`s${i}`, i));
    const out = layout({ sessions, hasLimits: true, maxWidth: 2000 });
    expect(out.pets).toHaveLength(5);
    expect(out.hidden).toBe(3);
    expect(out.hiddenIds).toEqual(['s0', 's1', 's2']);
    expect(out.badgeX).toBe(2);
    expect(out.pets[0].x).toBe(2 + BADGE_W + LEFT_REACH);
    expect(out.pets[1].x - out.pets[0].x).toBe(SLOT);
  });
  it('shrinks capacity to the free space between app icons and the tray', () => {
    const sessions = Array.from({ length: 5 }, (_, i) => mk(`s${i}`, i));
    const w2 = contentWidth(2, true, false);
    const out = layout({ sessions, hasLimits: false, maxWidth: w2 });
    expect(out.pets).toHaveLength(2);
    expect(out.hidden).toBe(3);
    expect(out.width).toBeLessThanOrEqual(w2);
  });
  it('capacity 0: only the badge when even one pet does not fit, nothing when the badge does not fit', () => {
    const s = [mk('a', 1), mk('b', 2)];
    expect(capacity(2, false, 30)).toBe(0);
    const out = layout({ sessions: s, hasLimits: false, maxWidth: 30 });
    expect(out.pets).toHaveLength(0);
    expect(out.badgeX).toBe(2);
    expect(out.width).toBeLessThanOrEqual(30);
    const none = layout({ sessions: s, hasLimits: false, maxWidth: 10 });
    expect(none.width).toBe(0);
    expect(none.badgeX).toBeNull();
  });
});

describe('stage settings in the layout', () => {
  it('zoom 1, no gap, padding 2 is exactly the 0.6 geometry', () => {
    expect(geometry(1, 0, 2)).toEqual({ zoom: 1, slot: SLOT, left: LEFT_REACH, right: RIGHT_REACH, pad: PAD, badgeW: BADGE_W, limitsW: LIMITS_W });
  });
  it('size and spacing scale the slots', () => {
    const g = geometry(1.2, 10, 8);
    expect(g.slot).toBeCloseTo(SLOT * 1.2 + 10);
    expect([g.left, g.right, g.badgeW, g.limitsW, g.pad]).toEqual([LEFT_REACH * 1.2, RIGHT_REACH * 1.2, BADGE_W * 1.2, LIMITS_W * 1.2, 8]);
    const out = layout({ sessions: [mk('a', 1), mk('b', 2)], hasLimits: false, maxWidth: 2000, geo: g });
    expect(out.pets[1].x - out.pets[0].x).toBeCloseTo(g.slot);
    expect(out.pets[0].x).toBeCloseTo(8 + g.left);
    expect(out.width).toBeCloseTo(8 * 2 + g.left + g.slot + g.right);
    expect(out.geo).toEqual(g);
  });
  it('taskbar zoom is capped at 120 %, the floating window takes its size from its height', () => {
    expect(zoomOf({ max_css: 500, height_css: 48, scale: 1 }, 100)).toBe(1);
    expect(zoomOf({ max_css: 500, height_css: 48, scale: 1, mode: 'taskbar' }, 150)).toBeCloseTo(1.2);
    expect(zoomOf({ max_css: 500, height_css: 40, scale: 1, mode: 'taskbar' }, 100)).toBeCloseTo(40 / 48);
    expect(zoomOf({ max_css: 500, height_css: 96, scale: 1, mode: 'floating' }, 200)).toBeCloseTo(2);
  });
  it('limits and the badge can be switched off', () => {
    const sessions = Array.from({ length: 7 }, (_, i) => mk(`s${i}`, i));
    const on = layout({ sessions, hasLimits: true, maxWidth: 2000 });
    const noLimits = layout({ sessions, hasLimits: true, maxWidth: 2000, showLimits: false });
    expect(noLimits.limitsX).toBeNull();
    expect(noLimits.width).toBe(on.width - LIMITS_W);
    const noBadge = layout({ sessions, hasLimits: false, maxWidth: 2000, showBadge: false });
    expect(noBadge.badgeX).toBeNull();
    expect(noBadge.hidden).toBe(2);
    expect(noBadge.pets[0].x).toBe(PAD + LEFT_REACH);
  });
  it('display order and who collapses into +N are separate: attention order still hides the sleepy ones', () => {
    const sessions = [mk('work', 1, 'working'), mk('sleep1', 2, 'sleep'), mk('sleep2', 3, 'sleep'), mk('needs', 4, 'needs_you')];
    const rank: Record<string, number> = { needs: 0, work: 1, sleep1: 3, sleep2: 3 };
    const display = (v: Session[]) => [...v].sort((a, b) => rank[a.id] - rank[b.id] || a.started_at - b.started_at);
    const out = layout({ sessions, hasLimits: false, maxWidth: 2000, maxPets: 2, order: display, priority: v => [...display(v)].reverse() });
    expect(out.pets.map(p => p.id)).toEqual(['needs', 'work']);
    expect([...out.hiddenIds].sort()).toEqual(['sleep1', 'sleep2']);
  });
});
