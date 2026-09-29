import { describe, expect, it } from 'vitest';
import { effectiveStyle } from '../renderer/effective';
import { drawPet, pen } from '../renderer';
import { recorder } from '../renderer/testing';
import { petFor, skinFor } from '../stage/sceneFor';
import type { Agent } from '../types';
import { blobPal, SKINS } from './index';
import { archP, floatLift } from '../renderer/draw/float';

pen.font = 'x';

describe('skins for agents', () => {
  it('every agent has a pet', () => {
    const want: Record<Agent, string> = { claude: 'clawd', codex: 'kodek', opencode: 'opencode', antigravity: 'antigravity', copilot: 'copilot',
      cursor: 'blob', grok: 'blob', zcode: 'blob', other: 'blob' };
    for (const [a, s] of Object.entries(want)) expect(skinFor(a), a).toBe(s);
  });
  it('pixel and sticker draw new pets like clean; clawd and kodek keep their own art', () => {
    expect(effectiveStyle('pixel', 'opencode')).toBe('clean');
    expect(effectiveStyle('sticker', 'blob')).toBe('clean');
    expect(effectiveStyle('pixel', 'antigravity')).toBe('clean');
    expect(effectiveStyle('sticker', 'copilot')).toBe('clean');
    expect(effectiveStyle('neon', 'opencode')).toBe('neon');
    expect(effectiveStyle('pixel', 'clawd')).toBe('pixel');
    expect(effectiveStyle('sticker', 'kodek')).toBe('sticker');
  });
  it('a blob colour comes from its name and stays the same', () => {
    expect(blobPal('Kilo CLI')).toEqual(blobPal('Kilo CLI'));
    expect(blobPal('Kilo CLI').m).not.toBe(blobPal('Goose').m);
    for (const v of Object.values(blobPal('Goose'))) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('a door pet wears its colour and first letter; others do not', () => {
    const k = petFor({ agent: 'other', agent_name: 'kilo CLI' }, 'idle');
    expect([k.type, k.mark, k.pal?.m]).toEqual(['blob', 'K', blobPal('kilo CLI').m]);
    expect(petFor({ agent: 'other', agent_name: '  ' }, 'idle').mark).toBe('A');
    expect(petFor({ agent: 'other', agent_name: '<img>' }, 'idle').mark).toBe('I');
    const c = petFor({ agent: 'claude', agent_name: null }, 'idle');
    expect([c.type, c.mark, c.pal]).toEqual(['clawd', undefined, undefined]);
    expect(SKINS.opencode.legacy).toBeFalsy();
    expect(SKINS.clawd.legacy && SKINS.kodek.legacy).toBe(true);
  });
  it('the blob draws its letter and opencode its logo eye', () => {
    const rec = recorder();
    drawPet(rec.ctx, petFor({ agent: 'other', agent_name: 'Kilo' }, 'idle'), 60, 40, 1, 0);
    expect(rec.log.some(l => l.startsWith('fillText(K'))).toBe(true);
    const oc = recorder();
    drawPet(oc.ctx, petFor({ agent: 'opencode', agent_name: null }, 'idle'), 60, 40, 1, 0.5);
    expect(oc.log.some(l => l.includes('#F1ECEC'))).toBe(true);
    expect(oc.log.some(l => l.includes('#131010'))).toBe(true);
  });
  it('Copilot is the logo head: goggles on top, a visor below with its eyes, ears on the sides', () => {
    const g = SKINS.copilot.pilot!;
    expect(g).toBeDefined();
    const rec = recorder();
    drawPet(rec.ctx, petFor({ agent: 'copilot', agent_name: null }, 'idle'), 60, 40, 1, 0.5);
    for (const c of [g.frame, g.lens, g.visor, SKINS.copilot.eyeColor!]) expect(rec.log.some(l => l.includes(c)), c).toBe(true);
    // wizjer przed oczami: oczy rysują się na nim, nie pod nim
    const visor = rec.log.findIndex(l => l.includes(g.visor)), eye = rec.log.findIndex(l => l.includes(SKINS.copilot.eyeColor!));
    expect(visor).toBeLessThan(eye);
    // oczy nad linią ramion (H·0,52): przy biurku ręce i blat nie zasłaniają twarzy
    expect(SKINS.copilot.eyeY!).toBeLessThan(.52);
  });
  it('Antigravity floats without legs over its shadow and wears the Google colours', () => {
    expect([SKINS.antigravity.legs.length, SKINS.antigravity.float, SKINS.antigravity.shape]).toEqual([0, true, 'arch']);
    const lift = (t: number) => floatLift(SKINS.antigravity, t, 0);
    const ys = [0, .3, .6, .9, 1.2].map(lift);
    expect(Math.min(...ys)).toBeGreaterThan(3);
    expect(new Set(ys.map(y => y.toFixed(2))).size).toBeGreaterThan(1);
    expect(floatLift(SKINS.clawd, .5, 0)).toBe(0);
    const rec = recorder();
    drawPet(rec.ctx, petFor({ agent: 'antigravity', agent_name: null }, 'idle'), 60, 40, 1, 0.5);
    for (const c of ['#4285F4', '#34A853', '#FBBC05', '#EA4335']) expect(rec.log.some(l => l.includes(`addColorStop`) && l.includes(c)), c).toBe(true);
  });
  it('the Google colours follow the style like every other fill', () => {
    const stops = (style: 'clean' | 'ink' | 'pastel') => {
      const rec = recorder();
      drawPet(rec.ctx, petFor({ agent: 'antigravity', agent_name: null }, 'idle'), 60, 40, 1, 0.5, { style, motion: 'calm' });
      return rec.log.filter(l => l.includes('addColorStop'));
    };
    expect(stops('clean').some(l => l.includes('#4285F4'))).toBe(true);
    expect(stops('ink').some(l => l.includes('#4285F4'))).toBe(false);
    expect(stops('ink').length).toBeGreaterThan(0);
    expect(stops('pastel').some(l => l.includes('#4285F4'))).toBe(false);
  });
  it('the arch has an opening at the bottom', () => {
    const p = archP(-40, -60, 80, 60, 10);
    const inside = (x: number, y: number) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    expect(inside(0, -50)).toBe(true);
    expect(inside(0, -3)).toBe(false);
    expect(inside(-32, -3)).toBe(true);
    expect(inside(32, -3)).toBe(true);
  });
});
