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
  it('idle: alternates a chibi spin with humming and training (push-ups, squats)', () => {
    const { seen, stats } = flags('clawd', 'idle', 9);
    expect(Math.max(...seen.map(s => Math.abs(s.th as number)))).toBeGreaterThan(Math.PI);
    expect(stats.note).toBeGreaterThanOrEqual(3);
    const acts = new Set(seen.map(s => s.act));
    expect(acts.has('trening: pompki') && acts.has('trening: przysiady')).toBe(true);
    const loaf = seen.filter(s => s.act === 'trening: pompki').map(s => s.loaf as number);
    expect(Math.max(...loaf) - Math.min(...loaf)).toBeGreaterThan(0.4);
    const sit = seen.filter(s => s.act === 'trening: przysiady').map(s => s.sit as number);
    expect(Math.max(...sit) - Math.min(...sit)).toBeGreaterThan(0.4);
  });
  it('sleep: a snot bubble grows and shrinks, then a dream bubble with a little scene', () => {
    const { seen } = flags('kodek', 'sleep', 9);
    const snot = seen.filter(s => s._snot != null).map(s => s._snot as number);
    expect(Math.min(...snot)).toBeLessThan(0.3);
    expect(Math.max(...snot)).toBeGreaterThan(0.7);
    expect(seen.some(s => s._dream != null)).toBe(true);
    expect(seen.every(s => s._prop === 'pillow')).toBe(true);
  });
  it('compact: two energy balls merge with an impact, then implode (energy pulled inward)', () => {
    const { seen, stats } = flags('clawd', 'compact', 3.5);
    expect(seen.some(s => s._orbs === 1)).toBe(true);
    expect(seen.some(s => s._orbs === 2)).toBe(true);
    expect(stats.impact).toBeGreaterThanOrEqual(1);
    expect(stats['word:ゴゴゴ']).toBeGreaterThanOrEqual(1);
    const inward = seen.flatMap(s => (s.parts as { k: string; x: number; y: number; vx: number; vy: number; life: number }[])
      .filter(p => p.k === 'energy' && p.life < 0.03)).filter(p => p.x * p.vx + (p.y + 50) * p.vy < 0);
    expect(inward.length).toBeGreaterThanOrEqual(5);
  });
  it('bye: a roadrunner escape — wind-up back, dash with a dust cloud and シュッ, gone within the slot', () => {
    const { seen, stats } = flags('clawd', 'bye', 3);
    const lx = seen.map(s => s.lx as number);
    expect(Math.min(...lx)).toBeLessThan(-3);        // zamach w tył
    expect(lx.at(-1)!).toBeGreaterThanOrEqual(45);
    expect(Math.max(...lx)).toBeLessThanOrEqual(50);
    expect(stats.dust).toBeGreaterThanOrEqual(6);
    expect(stats['word:シュッ']).toBeGreaterThanOrEqual(1);
  });
});
