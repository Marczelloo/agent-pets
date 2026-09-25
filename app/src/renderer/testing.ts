// Narzędzia tylko dla testów: deterministyczna losowość, nagrywający kontekst 2D i loader prototypu v6.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/** LCG z trybu filmstrip prototypu (`prototype/pets.js`, linia 245). */
export function seeded(seed: number) {
  let s = seed;
  return {
    next: () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; },
    reset: (v: number) => { s = v; },
  };
}

/** Kontekst 2D, który zapisuje każde wywołanie i przypisanie (liczby zaokrąglone do 0,001). */
export function recorder() {
  const log: string[] = [];
  const props: Record<string, unknown> = {
    globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x',
    textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
  };
  const r = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));
  let grads = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => {
      if (k in props) return props[k];
      if (k === 'measureText') return () => ({ width: 1 });
      if (k === 'createLinearGradient') return (...a: unknown[]) => {
        log.push(`createLinearGradient(${a.map(r).join(',')})`);
        const name = `grad${++grads}`;
        return { name, addColorStop: (o: number, c: string) => { log.push(`${name}.addColorStop(${r(o)},${c})`); } };
      };
      return (...a: unknown[]) => { log.push(`${k}(${a.map(r).join(',')})`); };
    },
    set: (_t, k: string, v) => { props[k] = v; log.push(`${k}=${typeof v === 'object' && v && 'name' in v ? (v as { name: string }).name : r(v)}`); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

export interface ProtoApi {
  S: Record<string, unknown>;
  mkC(type: string, st: string): any;
  stepC(c: any, dt: number, t: number): void;
  drawC(x: CanvasRenderingContext2D, c: any, X: number, Y: number, u: number, t: number): void;
  setSK(v: boolean): void;
  setBoil(v: number): void;
}

const PROTO = fileURLToPath(new URL('../../../prototype/pets.js', import.meta.url));

/** Ładuje prototyp v6 w piaskownicy `vm` z atrapami DOM; `Math.random` pochodzi z `rng`. */
export function loadPrototype(rng: () => number): ProtoApi {
  const noop = () => {};
  const el = (): Record<string, unknown> => ({
    clientWidth: 680, clientHeight: 300, getContext: () => recorder().ctx, style: {}, dataset: {},
    appendChild: noop, querySelectorAll: () => [], checked: false,
  });
  const els: Record<string, unknown> = {};
  const sandbox: Record<string, unknown> = {
    document: { getElementById: (id: string) => (els[id] ??= el()), createElement: el, body: {}, querySelectorAll: () => [] },
    window: { devicePixelRatio: 1, addEventListener: noop },
    getComputedStyle: () => ({ fontFamily: 'x', color: '#000' }),
    requestAnimationFrame: noop,
    performance: { now: () => 0 },
    __rng: rng,
  };
  const prototypeSource = readFileSync(PROTO, 'utf8');
  const hipMutation = 'Object.assign(sw?{armL:1.1}:HIP,';
  if (!prototypeSource.includes(hipMutation)) throw new Error('Prototype v6 HIP mutation patch target not found');
  // Fix the HIP mutation bug in prototype v6 before evaluating it.
  const patchedSource = prototypeSource.replace(hipMutation, 'Object.assign({},sw?{armL:1.1}:HIP,');
  // Każdy kontekst `vm` ma własny obiekt Math, więc podmiana nie wycieka do testów.
  const src = 'Math.random=__rng;' + patchedSource +
    ';globalThis.__p={S,mkC,stepC,drawC,setSK:v=>{SK=v},setBoil:v=>{BOIL=v}};';
  vm.runInNewContext(src, sandbox);
  return sandbox.__p as ProtoApi;
}
