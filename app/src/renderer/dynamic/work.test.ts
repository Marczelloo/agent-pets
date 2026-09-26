import { describe, expect, it } from 'vitest';
import { setRng } from '../index';
import { seeded, simulate } from '../testing';
import type { Particle } from './state';

setRng(seeded(11).next);
const flags = (skin: 'clawd' | 'kodek', scene: string, secs: number) => {
  const seen: Record<string, unknown>[] = [];
  const c = simulate(skin, scene, secs, cc => seen.push({ ...cc.tg, hxL: cc.p.hxL.x, hyL: cc.p.hyL.x, hxR: cc.p.hxR.x, hyR: cc.p.hyR.x, lx: cc.p.lx.x, act: cc.act[0] }));
  return { c, seen, stats: c.fx?.stats ?? {} };
};

describe('dynamic work scenes', () => {
  it('edit: ORA barrage into the keyboard with flying keys and sparks (no text), then a final punch with an impact frame', () => {
    const { seen, stats } = flags('clawd', 'edit', 7);
    expect(seen.some(s => s._barrage)).toBe(true);
    const hits = seen.filter(s => s._barrage).map(s => Math.max(s.hyL as number, s.hyR as number));
    expect(Math.max(...hits)).toBeGreaterThan(-36); // pięść dochodzi do klawiatury (y ≈ −30)
    expect(stats.key).toBeGreaterThanOrEqual(15);
    expect(stats.spark).toBeGreaterThanOrEqual(5);
    expect(Object.keys(stats).filter(k => k.startsWith('word:'))).toEqual(['word:BAM!']);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
    expect(seen.some(s => s._prop === 'desk')).toBe(true);
  });
  it('edit: the final punch winds up (hand up and back) before it strikes', () => {
    const { seen } = flags('clawd', 'edit', 7);
    const fin = seen.filter(s => s.act === 'finałowy cios');
    const top = Math.min(...fin.map(s => s.hyR as number)), bottom = Math.max(...fin.map(s => s.hyR as number));
    expect(top).toBeLessThan(-70);
    expect(bottom).toBeGreaterThan(-34);
    expect(fin.findIndex(s => (s.hyR as number) === top)).toBeLessThan(fin.findIndex(s => (s.hyR as number) === bottom));
  });
  it('edit: the final punch is readable — ≥ 0.2 s wind-up, hit-stop with BAM!, and the pose held ≥ 0.6 s', () => {
    const { seen, stats } = flags('clawd', 'edit', 8);
    const fin = seen.filter(s => s.act === 'finałowy cios');
    const topAt = fin.findIndex(s => (s.hyR as number) < -70);
    expect(topAt).toBeGreaterThanOrEqual(12);
    const struck = fin.findIndex(s => (s.hyR as number) > -36);
    let held = 0; for (let i = struck; i < fin.length && (fin[i].hyR as number) > -36; i++) held++;
    expect(held).toBeGreaterThanOrEqual(36);
    expect(stats.stop).toBeGreaterThanOrEqual(1);
    expect(stats['word:BAM!']).toBeGreaterThanOrEqual(1);
  });
  it('bash: at least 4 distinct hand seals, then a poof of smoke and the command runs', () => {
    const { seen, stats } = flags('kodek', 'bash', 4.5);
    const seals = seen.filter(s => s.act === 'pieczęcie rąk');
    const poses: number[][] = [];
    for (const s of seals) { const p = [s.hxL as number, s.hyL as number, s.hxR as number, s.hyR as number];
      if (!poses.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2], q[3] - p[3]) < 6)) poses.push(p); }
    expect(poses.length).toBeGreaterThanOrEqual(4);
    expect(stats.smoke).toBeGreaterThanOrEqual(6);
    expect(stats['word:POOF!']).toBeGreaterThanOrEqual(1);
    expect(seen.some(s => s._scr === 'run')).toBe(true);
  });
  it('read: glasses glint, pages fly off in the wind', () => {
    const { seen, stats } = flags('clawd', 'read', 5);
    expect(seen.some(s => s._face === 'glasses')).toBe(true);
    expect(seen.some(s => s._bg === 'wind')).toBe(true);
    expect(stats.page).toBeGreaterThanOrEqual(3);
    expect(seen.some(s => s._hold === 'sheet')).toBe(true);
  });
  it('grep: a detective walks along the board with a big magnifier, a hit stops everything with "!" and an impact frame', () => {
    const { seen, stats } = flags('kodek', 'grep', 6);
    const look = seen.filter(s => s.act === 'szuka z lupą');
    expect(look.every(s => s._lens === 1)).toBe(true);
    const lx = look.map(s => s.lx as number);
    expect(Math.max(...lx) - Math.min(...lx)).toBeGreaterThan(12);
    expect(Math.max(...lx.map(Math.abs))).toBeLessThanOrEqual(25);
    expect(seen.some(s => s._prop === 'board')).toBe(true);
    expect(stats['word:!']).toBeGreaterThanOrEqual(1);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
    expect(stats.stop).toBeGreaterThanOrEqual(1);
  });
  it('web: thunder-breathing zigzag dash with lightning, catches the page, comes back within the slot', () => {
    const { seen, stats } = flags('clawd', 'web', 4);
    const lx = seen.map(s => s.lx as number);
    expect(Math.max(...lx)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...lx.map(Math.abs))).toBeLessThanOrEqual(50);
    let turns = 0; for (let i = 2; i < lx.length; i++) if (Math.sign(lx[i] - lx[i - 1]) * Math.sign(lx[i - 1] - lx[i - 2]) < 0) turns++;
    expect(turns).toBeGreaterThanOrEqual(3);
    expect(stats.bolt).toBeGreaterThanOrEqual(5);
    expect(seen.some(s => s._hold === 'sheet')).toBe(true);
    expect(Math.min(...seen.filter(s => s.act === 'ogląda stronę').map(s => Math.abs(s.lx as number)))).toBeLessThan(8); // wrócił na miejsce
  });
  it('agent: a seal on the ground, a cloud of smoke and a mini helper running off', () => {
    const { c, seen, stats } = flags('kodek', 'agent', 3);
    expect(seen.some(s => s._ground === 'seal')).toBe(true);
    expect(stats.smoke).toBeGreaterThanOrEqual(8);
    expect(stats.helper).toBeGreaterThanOrEqual(1);
    expect(stats['word:POOF!']).toBeGreaterThanOrEqual(1);
    const h = c.fx.parts.find((p: Particle) => p.k === 'helper');
    if (h) expect(h.vx).toBeGreaterThan(0);
  });
  it('mcp: clap (hands meet), glowing transmutation circle, the tool rises from sparks', () => {
    const { seen, stats } = flags('clawd', 'mcp', 3);
    const clap = seen.filter(s => s.act === 'klaśnięcie');
    expect(Math.min(...clap.map(s => Math.abs((s.hxR as number) - (s.hxL as number))))).toBeLessThan(12);
    expect(seen.some(s => s._ground === 'circle')).toBe(true);
    expect(seen.some(s => s._hold === 'wrench')).toBe(true);
    expect(stats.spark).toBeGreaterThanOrEqual(10);
    expect(stats.energy).toBeGreaterThanOrEqual(5);
  });
  it('read: flying pages stay inside the pet slot (≤ 140u), not in the neighbour slot', () => {
    let far = -Infinity;
    simulate('clawd', 'read', 8, cc => { for (const p of (cc.fx?.parts ?? []) as Particle[]) if (p.k === 'page') far = Math.max(far, p.x); });
    expect(far).toBeGreaterThan(60);
    expect(far).toBeLessThanOrEqual(140);
  });
});
