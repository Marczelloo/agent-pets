import { describe, expect, it } from 'vitest';
import { K, SPR } from '../renderer/pose';
import { SCENES, createPet, setRng, stepPet } from '../renderer';
import { SCENES_DYNAMIC } from '../renderer/dynamic';
import { critStep, sceneTable, setMotion, setScene, stiffOf } from '../renderer/pet';
import { seeded } from '../renderer/testing';
import { emit, fxState, hitStop } from '../renderer/dynamic/state';
import { MOTIONS, effective } from './index';
import { tick } from './tick';

const rng = seeded(3);
setRng(rng.next);

describe('motion', () => {
  it('calm tick = the old stepPet with the global clock', () => {
    // każdy zwierzak liczony osobno od tego samego ziarna (stepPet losuje akcje i mrugnięcia)
    rng.reset(3); const a = createPet('clawd', 'edit');
    let T = 0;
    for (let f = 0; f < 120; f++) { T += 1 / 60; stepPet(a, 1 / 60, T + 0.5); }
    rng.reset(3); const b = createPet('clawd', 'edit');
    T = 0;
    for (let f = 0; f < 120; f++) { T += 1 / 60; tick(b, 1 / 60, T + 0.5, MOTIONS.calm, true); }
    for (const k of K) expect(b.p[k].x).toBeCloseTo(a.p[k].x, 9);
  });
  it('dynamic keeps the calm clock (acts and variants last as long as in calm) and stays finite at 10 fps', () => {
    for (const scene of Object.keys(SCENES)) {
      const c = createPet('kodek', scene);
      let T = 0;
      for (let f = 0; f < 200; f++) { T += 0.05; tick(c, 0.05, T, MOTIONS.dynamic, true); }
      for (const k of K) expect(Number.isFinite(c.p[k].x) && Math.abs(c.p[k].x) < 1e4, `${scene}/${k}`).toBe(true);
      expect(c.clk).toBeCloseTo(0.05 + 199 * 0.05, 6);
    }
  });
  it('switching motion keeps the clock continuous', () => {
    const c = createPet('clawd', 'idle');
    tick(c, 0.1, 5, MOTIONS.calm, true);
    const before = c.clk;
    tick(c, 0.1, 5.1, MOTIONS.dynamic, true);
    expect(c.clk - before).toBeCloseTo(0.1, 9);
  });
  it('dynamic springs never overshoot (critically damped), calm ones do', () => {
    const peak = (m: typeof MOTIONS.calm) => { rng.reset(9); const c = createPet('clawd', 'idle'); let T = 0, top = 0;
      c.act = ['test', 99, () => ({ armR: 0.35 })]; c.aT = 0; // cel niezależny od choreografii sceny
      c.p.armR.x = 0; c.p.armR.v = 0; for (let f = 0; f < 90; f++) { T += 1 / 60; tick(c, 1 / 60, T, m, true); top = Math.max(top, c.p.armR.x); } return top; };
    expect(peak(MOTIONS.calm)).toBeGreaterThan(0.35 * 1.02);
    expect(peak(MOTIONS.dynamic)).toBeLessThanOrEqual(0.35 + 1e-9);
  });
  it('critStep reaches the target without overshoot at 60 and 10 fps, for every spring', () => {
    for (const [k] of Object.values(SPR)) for (const mul of [1.8, 5.4]) for (const dt of [1 / 60, 0.1]) {
      const s = { x: 0, v: 0 };
      let top = 0;
      for (let i = 0; i < 200; i++) { critStep(s, 1, k * mul, dt); top = Math.max(top, s.x); }
      expect(top, `${k}×${mul}@${dt}`).toBeLessThanOrEqual(1 + 1e-9);
      expect(s.x).toBeCloseTo(1, 3);
    }
  });
  it('_stiff makes dynamic hands settle faster', () => {
    const act = MOTIONS.dynamic.spring.action ?? 1;
    const settle = (stiff: number) => { const s = { x: 0, v: 0 }; let n = 0; while (s.x < 0.9 && n < 600) { critStep(s, 1, 170 * act * stiff, 1 / 60); n++; } return n; };
    expect(settle(3)).toBeLessThan(settle(1));
    expect(settle(3) / 60).toBeLessThanOrEqual(0.12); // szybki cios: 90% drogi w ≤ 0,12 s
  });
  it('state changes are soft: plain springs at first, action stiffness only once the new state has started', () => {
    const c = createPet('clawd', 'idle'), spr = MOTIONS.dynamic.spring;
    setMotion(c, true);
    expect(stiffOf(c, {}, spr)).toBe(1);
    setScene(c, 'edit');
    expect(stiffOf(c, { _stiff: 3 }, spr)).toBe(1);
    let T = 0;
    for (let f = 0; f < 30; f++) { T += 1 / 60; tick(c, 1 / 60, T, MOTIONS.dynamic, true); }
    expect(stiffOf(c, { _stiff: 3 }, spr)).toBeCloseTo(3 * (spr.action ?? 1), 9);
    expect(stiffOf(c, {}, spr)).toBe(1);
  });
  it('saving halves particles and drops the action background; reduced drops flashes and shake', () => {
    expect(effective(MOTIONS.dynamic, { saving: false, reduced: false })).toEqual({ fx: true, bg: true, flash: true, shake: true, parts: 1 });
    expect(effective(MOTIONS.dynamic, { saving: true, reduced: false })).toEqual({ fx: true, bg: false, flash: true, shake: true, parts: 0.5 });
    expect(effective(MOTIONS.dynamic, { saving: false, reduced: true })).toEqual({ fx: true, bg: true, flash: false, shake: false, parts: 1 });
    expect(effective(MOTIONS.calm, { saving: false, reduced: false }).fx).toBe(false);
  });
  it('an dynamic pet plays the dynamic table; switching back restarts the calm scene', () => {
    const c = createPet('clawd', 'edit');
    setMotion(c, true);
    expect(sceneTable(c)).toBe(SCENES_DYNAMIC);
    expect(c.act).toBe(SCENES_DYNAMIC.edit.seq?.[0] ?? SCENES_DYNAMIC.edit.acts[0]);
    setMotion(c, false);
    expect(sceneTable(c)).toBe(SCENES);
    expect(c.act).toBe(SCENES.edit.acts[0]);
  });
  it('switching motion drops props and held items the new choreography does not use', () => {
    const c = createPet('clawd', 'web'); // Spokojny: siatka w dłoni
    expect(c.hold).toBe('net');
    setMotion(c, true); // Dynamiczny: dash bez siatki
    expect(c.hold).toBeNull();
    expect(c.p.holdA.x).toBe(0);
    const d = createPet('clawd', 'edit'); // biurko jest w obu choreografiach
    setMotion(d, true);
    expect(d.prop).toBe('desk');
  });
  it('dynamic pets skip the calm ambient sparkles and sweat drops (they have their own particles), calm pets keep them', () => {
    const run = (m: typeof MOTIONS.calm) => { rng.reset(4); const c = createPet('clawd', 'done'); setMotion(c, m.fx); let T = 0;
      const seen = new Set<string>(); for (let f = 0; f < 240; f++) { T += 1 / 60; tick(c, 1 / 60, T, m, true); c.parts.forEach((q: { t?: string; k?: string }) => seen.add(q.t ?? q.k ?? '')); } return seen; };
    expect(run(MOTIONS.calm).has('✦')).toBe(true);
    expect(run(MOTIONS.dynamic).has('✦')).toBe(false);
    rng.reset(4); const e = createPet('clawd', 'edit'); setMotion(e, true); let T = 0;
    for (let f = 0; f < 240; f++) { T += 1 / 60; tick(e, 1 / 60, T, MOTIONS.dynamic, true); expect(e.parts.some((q: { k?: string }) => q.k === 'drop')).toBe(false); }
  });
  it('a hit-stop freezes the whole pet (pose, act time, particles) for its duration, then it moves on', () => {
    const c = createPet('clawd', 'edit'); setMotion(c, true);
    let T = 0; const run = (s: number) => { for (let f = 0; f < Math.round(s * 60); f++) { T += 1 / 60; tick(c, 1 / 60, T, MOTIONS.dynamic, true); } };
    run(1);
    emit(c, 'spark', 0, -40, { vx: 50, max: 5 });
    fxState(c).t = c.clk; hitStop(c, 0.15);
    const pose = K.map(k => c.p[k].x), aT = c.aT, px = c.fx.parts[0].x;
    run(0.12);
    expect(K.map(k => c.p[k].x)).toEqual(pose);
    expect(c.aT).toBe(aT);
    expect(c.fx.parts[0].x).toBe(px);
    run(0.2);
    expect(c.aT).toBeGreaterThan(aT);
  });
  it('a brand-new pet starts right in the dynamic pose (no spring-in from the calm pose)', () => {
    const c = createPet('clawd', 'thinking'); // Spokojny: stoi; Dynamiczny: siedzi (Shikamaru)
    setMotion(c, true);
    expect(c.p.sit.x).toBe(1);
    const d = createPet('clawd', 'idle'); let T = 0;
    for (let f = 0; f < 10; f++) { T += 1 / 60; tick(d, 1 / 60, T, MOTIONS.calm, true); }
    setScene(d, 'thinking'); const sit = d.p.sit.x;
    setMotion(d, true); // pracujący zwierzak: przejście sprężynami, bez skoku
    expect(d.p.sit.x).toBe(sit);
  });
  it('the step hook runs every step with the act time, pet clock and dt', () => {
    const seen: number[][] = [];
    const c = createPet('clawd', 'idle');
    c.act = ['test', 9, () => ({}), undefined, undefined, (a: number, _c: unknown, t: number, dt: number) => seen.push([a, t, dt])];
    c.aT = 0;
    stepPet(c, 0.1, 5);
    stepPet(c, 0.1, 5.1);
    expect(seen.map(v => v.map(n => Math.round(n * 100) / 100))).toEqual([[0.1, 5, 0.1], [0.2, 5.1, 0.1]]);
  });
});
