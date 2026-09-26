import { describe, expect, it } from 'vitest';
import { setRng } from '../index';
import { seeded, simulate } from '../testing';
import type { Particle } from './state';

setRng(seeded(12).next);
const flags = (skin: 'clawd' | 'kodek', scene: string, secs: number) => {
  const seen: Record<string, unknown>[] = [];
  const c = simulate(skin, scene, secs, cc => seen.push({ ...cc.tg, th: cc.p.th.x, lx: cc.p.lx.x, sit: cc.p.sit.x, loaf: cc.p.loaf.x, act: cc.act[0], parts: cc.fx?.parts.map((p: Particle) => ({ ...p })) ?? [] }));
  return { c, seen, stats: c.fx?.stats ?? {} };
};

describe('anime state scenes', () => {
  it('thinking: shadow over the eyes, dramatic smile, a page falling in slow motion, ゴゴゴ', () => {
    const { seen, stats } = flags('clawd', 'thinking', 5);
    expect(seen.some(s => s._face === 'shadow')).toBe(true);
    expect(seen.some(s => s._face === 'shadow' && s._smile)).toBe(true);
    expect(stats['word:ゴゴゴ']).toBeGreaterThanOrEqual(2);
    const pages = seen.flatMap(s => (s.parts as { k: string; vy: number }[]).filter(p => p.k === 'page'));
    expect(pages.length).toBeGreaterThan(0);
    expect(Math.max(...pages.map(p => Math.abs(p.vy)))).toBeLessThan(40); // zwolnione tempo
  });
  it('needs: big sparkly eyes, bouncing "!" with shock lines, waving', () => {
    const { seen } = flags('kodek', 'needs', 3);
    expect(seen.some(s => s._face === 'sparkle' && s._bang && s._shock)).toBe(true);
    expect(seen.some(s => (s.oscR as number) > 0.3)).toBe(true);
  });
  it('done: Might Guy "Nice!" — thumbs up, teeth sparkle, sunset rays, confetti, an impact frame', () => {
    const { seen, stats } = flags('clawd', 'done', 3);
    expect(seen.some(s => s._thumb && s._face === 'teeth' && s._bg === 'rays')).toBe(true);
    expect(stats['word:NICE!']).toBeGreaterThanOrEqual(1);
    expect(stats.confetti).toBeGreaterThanOrEqual(12);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
  });
  it('error: the soul leaves through the mouth, grey, a sweat drop', () => {
    const { c, seen, stats } = flags('kodek', 'error', 4);
    expect(stats.soul).toBeGreaterThanOrEqual(1);
    expect(stats.tear).toBeGreaterThanOrEqual(2);
    expect(c.p.grey.x).toBeGreaterThan(0.8);
    const soul = seen.flatMap(s => (s.parts as { k: string; y: number }[]).filter(p => p.k === 'soul'));
    expect(Math.min(...soul.map(p => p.y))).toBeLessThan(soul[0].y - 10);
  });
});
