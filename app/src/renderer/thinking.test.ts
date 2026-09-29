import { describe, expect, it } from 'vitest';
import { SCENES, createPet, drawPet, pen, setRng, setScene, stepPet } from './index';
import { startAct } from './pet';
import { recorder, seeded } from './testing';

setRng(seeded(5).next);
pen.font = 'x';

/** Klatki jednej akcji „thinking”: cel prawej dłoni i twarz z poprzedniej klatki (z niej liczony jest cel). */
function run(skin: 'grok' | 'clawd', act: number, secs: number) {
  const c = createPet(skin, 'idle');
  setScene(c, 'thinking', true);
  const rec = recorder();
  let T = 0;
  const step = () => { T += 1 / 60; stepPet(c, 1 / 60, T); drawPet(rec.ctx, c, 60, 40, 1, T); };
  for (let f = 0; f < 30; f++) step();
  startAct(c, SCENES.thinking.acts[act]);
  const out: { hx: number; hy: number; fx: number; fy: number }[] = [];
  for (let f = 0; f < secs * 60; f++) { const face = c.face!.slice(); step(); out.push({ hx: c.tg.hxR, hy: c.tg.hyR, fx: face[0], fy: face[1] }); }
  return out;
}

describe('myślenie: dłoń pod brodą idzie za głową', () => {
  it('Grok rozgląda się, a dłoń obraca się razem z głową', () => {
    const f = run('grok', 2, 2.9), dx = f.map(o => o.hx - o.fx);
    expect(Math.max(...f.map(o => o.fx)) - Math.min(...f.map(o => o.fx))).toBeGreaterThan(10);
    expect(Math.max(...dx) - Math.min(...dx)).toBeLessThan(0.5);
  });

  it('dłoń Groka jest pod brodą, nie przy brzuchu', () => {
    for (const act of [0, 2]) for (const o of run('grok', act, 2.9)) {
      expect(o.hy - o.fy, `act ${act}`).toBeGreaterThan(6);
      expect(o.hy - o.fy, `act ${act}`).toBeLessThan(20);
    }
  });

  it('Clawd trzyma dłoń tam, gdzie w prototypie', () => {
    for (const act of [0, 2]) for (const o of run('clawd', act, 2.9)) { expect(o.hx).toBe(14); expect(o.hy).toBeGreaterThan(-28.6); expect(o.hy).toBeLessThan(-25.4); }
  });
});
