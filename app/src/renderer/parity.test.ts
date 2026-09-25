import { describe, expect, it } from 'vitest';
import { K } from './pose';
import { createPet, setRng, stepPet } from './index';
import { loadPrototype, seeded, type ProtoApi } from './testing';

export const PROTO_SCENES = ['thinking', 'edit', 'bash', 'read', 'grep', 'web', 'agent', 'mcp', 'needs', 'done', 'error', 'idle', 'sleep'];
export const SKIN_IDS = ['clawd', 'kodek'] as const;

const rng = seeded(7);
const proto: ProtoApi = loadPrototype(rng.next);
setRng(rng.next);

/** Stan po każdej 20. klatce: nazwa akcji i wszystkie sprężyny (6 miejsc po przecinku). */
function trace(make: () => any, step: (c: any, dt: number, t: number) => void): string[] {
  rng.reset(7);
  const c = make();
  const out: string[] = [];
  let T = 0;
  for (let f = 1; f <= 240; f++) {
    T += 1 / 60;
    step(c, 1 / 60, T);
    if (f % 20 === 0) out.push(`${c.act[0]}|${K.map(k => c.p[k].x.toFixed(6)).join(',')}|parts=${c.parts.length}`);
  }
  return out;
}

describe('port silnika = prototyp v6', () => {
  for (const skin of SKIN_IDS) for (const scene of PROTO_SCENES) {
    it(`${skin} / ${scene}`, () => {
      const a = trace(() => proto.mkC(skin, scene), proto.stepC);
      const b = trace(() => createPet(skin, scene), stepPet);
      expect(b).toEqual(a);
    });
  }
});

import { drawPet, pen } from './index';
import { recorder } from './testing';

pen.font = 'x';

function drawTrace(api: {
  make: () => any; step: (c: any, dt: number, t: number) => void;
  draw: (x: CanvasRenderingContext2D, c: any, X: number, Y: number, u: number, t: number) => void;
  boil: (v: number) => void;
}, u: number): string[] {
  rng.reset(7);
  const c = api.make();
  const rec = recorder();
  let T = 0;
  for (let f = 1; f <= 240; f++) {
    T += 1 / 60;
    api.boil(Math.floor(T * 8));
    api.step(c, 1 / 60, T);
    if (f % 40 === 0) { rec.log.push(`--- klatka ${f}`); api.draw(rec.ctx, c, 100, 150, u, T); }
  }
  return rec.log;
}

describe('port rysowania = prototyp v6', () => {
  // Szkic przy u = 0,3 różni się celowo (minima w pikselach, styles.test.ts).
  // Szkic v2 nie jest już zgodny z prototypem (spec wyglądu v2, 4): zgodność pilnuje tylko Czysty.
  for (const skin of SKIN_IDS) for (const scene of PROTO_SCENES) for (const sketch of [false]) for (const u of [1, 0.3]) {
    it(`${skin} / ${scene} / ${sketch ? 'rysowany' : 'czysty'} / u=${u}`, () => {
      proto.setSK(sketch);
      const a = drawTrace({ make: () => proto.mkC(skin, scene), step: proto.stepC, draw: proto.drawC, boil: proto.setBoil }, u);
      const look = { style: sketch ? 'sketch' : 'clean', motion: 'calm' } as const;
      const b = drawTrace({ make: () => createPet(skin, scene), step: stepPet,
        draw: (x, c, X, Y, uu, t) => drawPet(x, c, X, Y, uu, t, look), boil: v => { pen.boil = v; } }, u);
      expect(b.length).toBe(a.length);
      const i = b.findIndex((v, k) => v !== a[k]);
      expect(i === -1 ? null : { at: i, proto: a[i], port: b[i], before: a.slice(Math.max(0, i - 3), i) }).toBeNull();
    });
  }
});
