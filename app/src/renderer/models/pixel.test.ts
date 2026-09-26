import { describe, expect, it } from 'vitest';
import { SCENES, createPet, drawPet, pen, setRng, stepPet } from '../index';
import { recorder, seeded } from '../testing';
import { SPRITES } from './sprites';
import { gridPx } from './pixel';

setRng(seeded(4).next);
const draw = (scene: string, t: number, dpr: number, u = .3, skin: 'clawd' | 'kodek' = 'clawd') => {
  setRng(seeded(4).next);
  const c = createPet(skin, scene);
  for (let i = 1; i <= 120; i++) stepPet(c, 1 / 60, i / 60);
  pen.dpr = dpr;
  const r = recorder();
  drawPet(r.ctx, c, 61.3, 40.2, u, t, { style: 'pixel', motion: 'calm' });
  pen.dpr = 1;
  return r.log;
};

describe('pixel model', () => {
  it('only integer device-pixel rectangles: no paths, arcs, text or images', () => {
    for (const dpr of [1, 1.25, 1.5]) for (const scene of Object.keys(SCENES)) for (const skin of ['clawd', 'kodek'] as const) {
      const log = draw(scene, 2, dpr, .3, skin);
      expect(log.some(l => /^(moveTo|lineTo|arc|ellipse|quadraticCurveTo|fillText|strokeText|drawImage|stroke|fill)\(/.test(l)), `${skin}/${scene}@${dpr}`).toBe(false);
      for (const l of log.filter(v => v.startsWith('fillRect('))) {
        for (const v of l.slice(9, -1).split(',').map(Number)) expect(Math.abs(v * dpr - Math.round(v * dpr)), `${l}@${dpr}`).toBeLessThan(2e-3);
      }
    }
  });
  it('grid cell is a whole number of device pixels, at least 2 in the taskbar', () => {
    expect([gridPx(.3, 1), gridPx(.3, 1.25), gridPx(.3, 1.5), gridPx(.7, 1.25)]).toEqual([2, 2, 2, 4]);
  });
  it('moves in steps of 0.1 s: the same frame until the step ends, even while the springs move', () => {
    setRng(seeded(4).next);
    const c = createPet('clawd', 'done'); // skoki: ruch większy niż komórka siatki
    let T = 2;
    const frame = () => { const r = recorder(); drawPet(r.ctx, c, 61.3, 40.2, .3, T, { style: 'pixel', motion: 'calm' }); return r.log; };
    const advance = (dt: number) => { for (let i = 0; i < Math.round(dt * 60); i++) { T += 1 / 60; stepPet(c, 1 / 60, T); } };
    advance(.01);
    const a = frame();
    advance(.05);
    expect(frame()).toEqual(a);
    advance(.5);
    expect(frame()).not.toEqual(a);
  });
  it('a small palette per pet and prop', () => {
    const cols = new Set(draw('edit', 2, 1).filter(l => l.startsWith('fillStyle=')));
    expect(cols.size).toBeLessThanOrEqual(14);
  });
  it('sprites are rectangular and use known palette keys', () => {
    for (const [name, rows] of Object.entries(SPRITES)) {
      expect(new Set(rows.map(r => r.length)).size, name).toBe(1);
      for (const r of rows) expect(/^[.klmsdtcpbywhg]+$/.test(r), `${name}: ${r}`).toBe(true);
    }
  });
});
