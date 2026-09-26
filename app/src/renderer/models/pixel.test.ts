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
  // pasek: wysokość 48, podstawa zwierzaka Y = h − 8 = 40, u = 0,3 (stage.ts)
  const frames = (scene: string, skin: 'clawd' | 'kodek', dpr: number, n = 240) => {
    setRng(seeded(4).next);
    const c = createPet(skin, scene);
    const out: string[][] = [];
    pen.dpr = dpr;
    for (let i = 1; i <= n; i++) {
      stepPet(c, 1 / 60, i / 60);
      if (i % 3) continue;
      const r = recorder();
      drawPet(r.ctx, c, 60, 40, .3, i / 60, { style: 'pixel', motion: 'calm' });
      out.push(r.log);
    }
    pen.dpr = 1;
    return { c, out };
  };
  const rects = (log: string[]) => log.filter(l => l.startsWith('fillRect(')).map(l => l.slice(9, -1).split(',').map(Number));
  it('status overlays stay inside the 48 px taskbar at 100/125/150 % (needs, thinking, Kodek antenna)', () => {
    for (const dpr of [1, 1.25, 1.5]) for (const [scene, skin] of [['needs', 'clawd'], ['needs', 'kodek'], ['thinking', 'clawd'], ['idle', 'kodek']] as const) {
      const top = Math.min(...frames(scene, skin, dpr).out.flatMap(l => rects(l).map(r => r[1])));
      expect(top, `${skin}/${scene}@${dpr}`).toBeGreaterThanOrEqual(0);
    }
  });
  it('the pet has the same size in the brain units at every screen scale', () => {
    const width = (dpr: number) => { const rs = rects(frames('idle', 'clawd', dpr, 3).out[0]); return Math.max(...rs.map(r => r[0] + r[2])) - Math.min(...rs.map(r => r[0])); };
    const w1 = width(1), w15 = width(1.5);
    expect(Math.abs(w15 - w1) / w1).toBeLessThan(.15);
  });
  it('typing hands rest on the desk keyboard (edit scene)', () => {
    const { c } = frames('edit', 'clawd', 1, 240);
    const [[lx, ly], [rx, ry]] = c.hand as number[][];
    // klawiatura pikselowego biurka: x −10…35 u, y ≈ −30 u (jak TYPE(-2, 18) w scenes.ts)
    for (const [hx, hy] of [[lx, ly], [rx, ry]]) { expect(hx).toBeGreaterThan(-12); expect(hx).toBeLessThan(36); expect(Math.abs(hy + 30)).toBeLessThan(8); }
    // prostokąty w kolorze klawiatury (#2C2C2A, u Clawda nieużywany) na wysokości dłoni
    let col = '';
    const keys: number[][] = [];
    for (const l of frames('edit', 'clawd', 1, 3).out[0]) {
      if (l.startsWith('fillStyle=')) col = l.slice(10);
      else if (l.startsWith('fillRect(') && col === '#2C2C2A') keys.push(l.slice(9, -1).split(',').map(Number));
    }
    const deskLeft = Math.min(...keys.filter(r => r[1] >= 40 - 34 * .3 && r[1] <= 40 - 22 * .3).map(r => r[0]));
    expect(deskLeft).toBeLessThanOrEqual(60 + lx * .3); // klawiatura zaczyna się pod lewą dłonią albo dalej w lewo
  });
  it('a sitting pet rests on its shadow (no gap)', () => {
    const rs = rects(frames('idle', 'clawd', 1, 240).out.at(-1)!);
    const bodyBottom = Math.max(...rs.filter(r => r[1] < 39).map(r => r[1] + r[3]));
    expect(40 - bodyBottom).toBeLessThanOrEqual(2);
  });
});

