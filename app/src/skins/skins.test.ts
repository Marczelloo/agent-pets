import { describe, expect, it } from 'vitest';
import { effectiveStyle } from '../renderer/effective';
import { drawPet, pen } from '../renderer';
import { recorder } from '../renderer/testing';
import { petFor, skinFor } from '../stage/sceneFor';
import type { Agent } from '../types';
import { blobPal, SKINS } from './index';
import { androidP, floatLift } from '../renderer/draw/float';
import { DROID_SHOULDER, droidP } from '../renderer/draw/marks';
import { PREVIEW_AGENTS } from '../settings/look/LookTab';
import { accentFor } from '../stage/sceneFor';
import { ACCENT } from '../styles';

pen.font = 'x';

describe('skins for agents', () => {
  it('every agent has a pet', () => {
    const want: Record<Agent, string> = { claude: 'clawd', codex: 'kodek', opencode: 'opencode', antigravity: 'antigravity', copilot: 'copilot',
      cursor: 'cursor', grok: 'grok', zcode: 'zcode', other: 'blob' };
    for (const [a, s] of Object.entries(want)) expect(skinFor(a), a).toBe(s);
  });
  it('pixel and sticker draw new pets like clean; clawd and kodek keep their own art', () => {
    expect(effectiveStyle('pixel', 'opencode')).toBe('clean');
    expect(effectiveStyle('sticker', 'blob')).toBe('clean');
    expect(effectiveStyle('pixel', 'antigravity')).toBe('clean');
    expect(effectiveStyle('sticker', 'copilot')).toBe('clean');
    for (const s of ['cursor', 'grok', 'zcode'] as const) {
      expect(effectiveStyle('pixel', s), s).toBe('clean');
      expect(effectiveStyle('sticker', s), s).toBe('clean');
    }
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
  it('Antigravity is the green Android robot floating over its shadow, legs hanging', () => {
    expect([SKINS.antigravity.legs.length, SKINS.antigravity.float, SKINS.antigravity.shape]).toEqual([2, true, 'android']);
    const lift = (t: number) => floatLift(SKINS.antigravity, t, 0);
    const ys = [0, .3, .6, .9, 1.2].map(lift);
    expect(Math.min(...ys)).toBeGreaterThan(3);
    expect(new Set(ys.map(y => y.toFixed(2))).size).toBeGreaterThan(1);
    expect(floatLift(SKINS.clawd, .5, 0)).toBe(0);
    const rec = recorder();
    drawPet(rec.ctx, petFor({ agent: 'antigravity', agent_name: null }, 'idle'), 60, 40, 1, 0.5);
    expect(rec.log).toContain('fillStyle=rgb(61,220,132)'); // #3DDC84, zieleń Androida
    expect(rec.log).toContain('fillStyle=#FFFFFF'); // białe oczy
  });
  it('the Android robot is a smooth dome over a torso, split by a gap', () => {
    const [head, torso] = androidP(-40, -60, 80, 60, 10);
    const ys = (p: number[][]) => p.map(q => q[1]);
    expect(Math.max(...ys(head))).toBeLessThan(Math.min(...ys(torso)));
    expect(Math.min(...ys(head))).toBeCloseTo(-60);
    expect(Math.max(...ys(torso))).toBeCloseTo(0);
    // kopułka gładka: kolejne punkty łuku blisko siebie
    for (let i = 1; i < head.length; i++) expect(Math.hypot(head[i][0] - head[i - 1][0], head[i][1] - head[i - 1][1])).toBeLessThan(5);
  });
  it('the Android robot keeps visible eyes when the style bleaches its body', () => {
    const eyes = (style: 'clean' | 'ink' | 'pastel') => {
      const rec = recorder();
      drawPet(rec.ctx, petFor({ agent: 'antigravity', agent_name: null }, 'idle'), 60, 40, 1, 0.5, { style, motion: 'calm' });
      return rec.log.some(l => l.includes('#1E1410'));
    };
    expect(eyes('ink')).toBe(true);
    expect(eyes('pastel')).toBe(true);
  });
  it('Cursor, Grok and ZCode have their own pets, walk, keep their eyes above the desk and show up in the preview', () => {
    for (const s of ['cursor', 'grok', 'zcode'] as const) {
      expect(SKINS[s].legs.length, s).toBe(2);
      expect(SKINS[s].eyeY!, s).toBeLessThan(.52);
      expect(accentFor({ agent: s, agent_name: null }), s).toBe(ACCENT[s]);
    }
    expect([ACCENT.cursor, ACCENT.grok, ACCENT.zcode]).toEqual(['#D0D0D0', '#9A9AA6', '#2F6BFF']);
    expect(PREVIEW_AGENTS).toEqual(expect.arrayContaining(['cursor', 'grok', 'zcode']));
  });
  const draw = (agent: Agent, state: Parameters<typeof petFor>[1] = 'idle') => {
    const rec = recorder();
    drawPet(rec.ctx, petFor({ agent, agent_name: null }, state), 60, 40, 1, 0.5);
    return rec.log;
  };
  it('Cursor is a dark faceted block with a lighter facet and a bright edge', () => {
    const f = SKINS.cursor.facet!;
    expect(SKINS.cursor.pal.m).toBe('#1A1A1A');
    const log = draw('cursor');
    for (const c of [f.light, f.edge, SKINS.cursor.eyeColor!]) expect(log.some(l => l.includes(c)), c).toBe(true);
  });
  it('Grok is a mini humanoid: white body, black visor with upright eyes, the Grok logo on the chest, black hands', () => {
    const g = SKINS.grok, d = g.droid!;
    expect(d).toEqual({ visor: '#0E0E10', logo: '#1A1A1A', hands: '#222222' });
    expect(g.pal.m).toBe('#ECECEA');
    // stojąc (tułów + nogi) jest wyższy niż szeroki
    expect(g.height + g.legLen!).toBeGreaterThan(g.width);
    expect(g.eyeColor).toBe('#FFFFFF');
    expect(g.eyeY!).toBeLessThan(.36);
    const log = draw('grok');
    for (const c of [d.visor, d.logo, d.hands]) expect(log.some(l => l.includes(c)), c).toBe(true);
    // logo: pierścień z przerwą w prawym górnym rogu (łuk krótszy niż pełne koło)
    const arcs = log.filter(l => l.startsWith('ellipse(')).map(l => l.slice(8, -1).split(',').map(Number));
    expect(arcs.some(a => a[6] - a[5] > Math.PI && a[6] - a[5] < 2 * Math.PI - .3)).toBe(true);
  });
  it("Grok's silhouette is a humanoid: a narrower head on a neck above broad shoulders, narrowing to the waist", () => {
    const p = droidP(0, 0, 100, 100);
    // szerokość sylwetki na wysokości y: skrajne przecięcia krawędzi z poziomą linią
    const at = (y: number) => {
      const xs: number[] = [];
      p.forEach((a, i) => { const b = p[(i + 1) % p.length]; if (a[1] !== b[1] && (a[1] - y) * (b[1] - y) <= 0) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); });
      return Math.max(...xs) - Math.min(...xs);
    };
    const head = at(18), neck = at(39), shoulders = at(52), waist = at(80), hips = at(98);
    expect(neck).toBeGreaterThan(0);
    // barki wyraźnie węższe niż całe ciało (.8 szerokości); ramiona zaczepione na ich krawędzi
    expect(DROID_SHOULDER).toBe(.4);
    expect(shoulders).toBeLessThanOrEqual(80.01);
    expect(shoulders).toBeGreaterThan(76);
    expect(head).toBeLessThan(shoulders * .65);
    expect(neck).toBeLessThan(head * .6);
    expect(waist).toBeLessThan(shoulders * .6);
    expect(hips).toBeGreaterThan(waist);
    expect(hips).toBeLessThan(shoulders * .7);
    for (const q of p) for (const v of q) expect(Number.isFinite(v)).toBe(true);
  });
  it('Grok stands on long legs with dark knees and feet, and has thinner arms', () => {
    const g = SKINS.grok;
    expect(g.legLen!).toBeGreaterThanOrEqual(26);
    expect(g.armThk!).toBeLessThan(9);
    // w idle siedzi (nogi schowane) — nogi widać na stojąco
    const log = draw('grok', 'thinking');
    // dwie dłonie, dwa kolana, dwie stopy
    expect(log.filter(l => l === `fillStyle=${g.droid!.hands}`).length).toBeGreaterThanOrEqual(6);
  });
  it('every pet keeps its eyes upright (no tilt), and other pets keep their own hands', () => {
    // Grok też: skośne oczy odrzucone przez użytkownika
    for (const s of Object.keys(SKINS) as (keyof typeof SKINS)[]) expect('eyeTilt' in SKINS[s], s).toBe(false);
    for (const s of ['clawd', 'kodek', 'copilot', 'cursor', 'zcode'] as const) {
      expect(SKINS[s].droid, s).toBeUndefined();
      expect(SKINS[s].legLen, s).toBeUndefined();
      expect(SKINS[s].armThk, s).toBeUndefined();
    }
  });
  it('ZCode is a panda: ears, patches under the eyes and a headband with a Z', () => {
    const p = SKINS.zcode.panda!;
    expect(p).toEqual({ ears: '#1B1B1B', patches: '#1B1B1B', band: '#2F6BFF', mark: '#FFFFFF' });
    const log = draw('zcode');
    expect(log.some(l => l.includes(p.band))).toBe(true);
    expect(log.some(l => l.startsWith('fillText(Z'))).toBe(true);
    // łaty przed oczami: oczy rysują się na nich
    const patch = Math.max(...log.map((l, i) => (l.includes(p.patches) ? i : -1))), eye = log.findIndex(l => l.includes(SKINS.zcode.eyeColor!));
    expect(patch).toBeGreaterThan(-1);
    expect(patch).toBeLessThan(eye);
  });
});
