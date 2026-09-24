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
