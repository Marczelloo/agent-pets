import { describe, expect, it } from 'vitest';
import { setRng } from '../index';
import { seeded, simulate } from '../testing';

setRng(seeded(11).next);
const flags = (skin: 'clawd' | 'kodek', scene: string, secs: number) => {
  const seen: Record<string, unknown>[] = [];
  const c = simulate(skin, scene, secs, cc => seen.push({ ...cc.tg, hxL: cc.p.hxL.x, hyL: cc.p.hyL.x, hxR: cc.p.hxR.x, hyR: cc.p.hyR.x, lx: cc.p.lx.x, act: cc.act[0] }));
  return { c, seen, stats: c.fx?.stats ?? {} };
};

describe('anime work scenes', () => {
  it('edit: ORA barrage into the keyboard with flying keys, sparks, ドドド and a final punch with an impact frame', () => {
    const { seen, stats } = flags('clawd', 'edit', 7);
    expect(seen.some(s => s._barrage)).toBe(true);
    const hits = seen.filter(s => s._barrage).map(s => Math.max(s.hyL as number, s.hyR as number));
    expect(Math.max(...hits)).toBeGreaterThan(-36); // pięść dochodzi do klawiatury (y ≈ −30)
    expect(stats.key).toBeGreaterThanOrEqual(15);
    expect(stats.spark).toBeGreaterThanOrEqual(5);
    expect(stats['word:ドドド']).toBeGreaterThanOrEqual(2);
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
  it('bash: at least 4 distinct hand seals, then a poof of smoke and the command runs', () => {
    const { seen, stats } = flags('kodek', 'bash', 4.5);
    const seals = seen.filter(s => s.act === 'pieczęcie rąk');
    const poses: number[][] = [];
    for (const s of seals) { const p = [s.hxL as number, s.hyL as number, s.hxR as number, s.hyR as number];
      if (!poses.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2], q[3] - p[3]) < 6)) poses.push(p); }
    expect(poses.length).toBeGreaterThanOrEqual(4);
    expect(stats.smoke).toBeGreaterThanOrEqual(6);
    expect(stats['word:ボン']).toBeGreaterThanOrEqual(1);
    expect(seen.some(s => s._scr === 'run')).toBe(true);
  });
  it('read: glasses glint, pages fly off in the wind', () => {
    const { seen, stats } = flags('clawd', 'read', 5);
    expect(seen.some(s => s._face === 'glasses')).toBe(true);
    expect(seen.some(s => s._bg === 'wind')).toBe(true);
    expect(stats.page).toBeGreaterThanOrEqual(3);
    expect(seen.some(s => s._hold === 'sheet')).toBe(true);
  });
  it('grep: the Sharingan zooms in fast, scans, and a hit gets "!" and an impact frame', () => {
    const { seen, stats } = flags('kodek', 'grep', 5);
    const scan = seen.filter(s => s._face === 'sharingan');
    expect(scan.length).toBeGreaterThan(0);
    const firstFull = seen.findIndex(s => (s._faceK as number) >= 1);
    expect(firstFull).toBeGreaterThanOrEqual(0);
    expect(firstFull - seen.findIndex(s => s._face === 'sharingan')).toBeLessThanOrEqual(15); // ≤ 0,25 s
    expect(new Set(scan.map(s => Math.round((s._scan as number) * 10))).size).toBeGreaterThan(3);
    expect(stats['word:!']).toBeGreaterThanOrEqual(1);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
  });
});
