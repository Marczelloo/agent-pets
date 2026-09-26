import { describe, expect, it } from 'vitest';
import { createPet, setRng, stepPet } from '../index';
import { seeded } from '../testing';
import { CAP, PHYS, emit, fxState, impact, spray, stepFx, word, type Particle } from './state';

setRng(seeded(5).next);
const pet = () => createPet('clawd', 'idle');

describe('dynamic fx state', () => {
  it('caps particles per pet and drops the oldest first', () => {
    const c = pet();
    for (let i = 0; i < 100; i++) emit(c, 'spark', i, 0);
    expect(c.fx.parts.length).toBe(CAP);
    expect(c.fx.parts[0].x).toBe(100 - CAP);
    expect(c.fx.stats.spark).toBe(100);
  });
  it('power saving: half the cap and every other emission skipped', () => {
    const c = pet();
    fxState(c).env = { fx: true, bg: false, flash: true, shake: true, parts: 0.5 };
    for (let i = 0; i < 10; i++) emit(c, 'dust', 0, 0);
    expect(c.fx.parts.length).toBe(5);
    for (let i = 0; i < 100; i++) emit(c, 'dust', 0, 0);
    expect(c.fx.parts.length).toBe(CAP / 2);
  });
  it('every kind has its own physics: keys fall, smoke and souls rise, sparks slow down', () => {
    const c = pet();
    for (const k of Object.keys(PHYS) as (keyof typeof PHYS)[]) emit(c, k, 0, -50, { vx: 50, vy: 0, max: 5 });
    for (let i = 0; i < 20; i++) stepFx(c, 1 / 60, i / 60);
    const by = (k: string) => c.fx.parts.find((p: Particle) => p.k === k)!;
    expect(by('key').y).toBeGreaterThan(-50);
    expect(by('smoke').y).toBeLessThan(-50);
    expect(by('soul').y).toBeLessThan(-50);
    expect(Math.abs(by('spark').vx)).toBeLessThan(50);
  });
  it('particles expire after their life', () => {
    const c = pet();
    emit(c, 'spark', 0, 0, { max: 0.2 });
    for (let i = 0; i < 13; i++) stepFx(c, 1 / 60, i / 60);
    expect(c.fx.parts.length).toBe(0);
  });
  it('spray emits n particles fanned around a direction', () => {
    const c = pet();
    spray(c, 'confetti', 12, 0, -60, 150, -Math.PI / 2, Math.PI / 2);
    expect(c.fx.parts.length).toBe(12);
    expect(c.fx.parts.every((p: Particle) => p.vy < 0)).toBe(true);
  });
  it('an impact asks for a flash and starts a shake at the pet clock', () => {
    const c = pet();
    fxState(c).t = 3.2;
    impact(c, 3);
    expect(c.fx.flashReq).toBe(1);
    expect(c.fx.shakeAt).toBe(3.2);
    expect(c.fx.shakeAmp).toBe(3);
    c.fx.flashReq = 0;
    impact(c, 1, false);
    expect(c.fx.flashReq).toBe(0);
  });
  it('words rise and fade out', () => {
    const c = pet();
    word(c, 'バン', 0, -90);
    for (let i = 0; i < 30; i++) stepFx(c, 1 / 60, i / 60);
    expect(c.fx.words[0].y).toBeLessThan(-90);
    for (let i = 0; i < 120; i++) stepFx(c, 1 / 60, i / 60);
    expect(c.fx.words.length).toBe(0);
  });
  it('stepPet steps the effects and gives hooks the pet clock', () => {
    const c = pet();
    let seen = -1;
    c.act = ['t', 9, () => ({}), undefined, undefined, (_a: number, cc: any) => { seen = cc.fx.t; emit(cc, 'spark', 0, 0, { max: 1 }); }];
    c.aT = 0;
    stepPet(c, 0.1, 7);
    expect(seen).toBe(7);
    stepPet(c, 0.1, 7.1);
    expect(c.fx.parts[0].life).toBeCloseTo(0.2, 9);
  });
});
