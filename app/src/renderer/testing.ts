// Narzędzia tylko dla testów: deterministyczna losowość, nagrywający kontekst 2D i loader prototypu v6.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createPet, setMotion, type Pet } from './pet';
import { MOTIONS } from '../motion';
import { tick } from '../motion/tick';

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

/** Zwierzak w ruchu Dynamiczny liczony przez `tick` przy 60 kl./s przez `secs` sekund; `each` po każdym kroku. */
export function simulate(skin: 'clawd' | 'kodek', scene: string, secs: number, each?: (c: Pet, T: number) => void): Pet {
  const c = createPet(skin, scene);
  setMotion(c, true);
  let T = 0;
  for (let i = 0; i < Math.round(secs * 60); i++) { T += 1 / 60; tick(c, 1 / 60, T, MOTIONS.dynamic, true); each?.(c, T); }
  return c;
}

/** Kontekst 2D, który śledzi przekształcenia i zapamiętuje najwyższy punkt rysunku w układzie ekranu (`top()`). */
export function extent() {
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0], top = Infinity, where = '', font = 10, base = 'alphabetic';
  /** górna krawędź napisu wg rozmiaru czcionki i linii bazowej */
  const textTop = (y: number) => y - font * (base === 'top' ? 0 : base === 'middle' ? 0.5 : base === 'bottom' ? 1 : 0.8);
  const stack: M[] = [];
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const pt = (x: number, y: number, op: string) => { const Y = m[1] * x + m[3] * y + m[5]; if (Number.isFinite(Y) && Y < top) { top = Y; where = op; } };
  const ops: Record<string, (...a: any[]) => void> = {
    save: () => stack.push([...m] as M), restore: () => { m = stack.pop() ?? m; },
    translate: (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); }, scale: (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate: (a) => { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); },
    setTransform: (a, b, c, d, e, f) => { m = [a, b, c, d, e, f]; }, resetTransform: () => { m = [1, 0, 0, 1, 0, 0]; },
    moveTo: (x, y) => pt(x, y, 'moveTo'), lineTo: (x, y) => pt(x, y, 'lineTo'),
    quadraticCurveTo: (cx, cy, x, y) => { pt(cx, cy, 'quad'); pt(x, y, 'quad'); },
    bezierCurveTo: (a, b, c, d, x, y) => { pt(a, b, 'bez'); pt(c, d, 'bez'); pt(x, y, 'bez'); },
    rect: (x, y, w, h) => { pt(x, y, 'rect'); pt(x + w, y + h, 'rect'); pt(x, y + h, 'rect'); pt(x + w, y, 'rect'); },
    fillRect: (x, y, w, h) => { pt(x, y, 'fillRect'); pt(x + w, y, 'fillRect'); pt(x, y + h, 'fillRect'); },
    arc: (x, y, r) => { for (let i = 0; i < 8; i++) pt(x + r * Math.cos(i * Math.PI / 4), y + r * Math.sin(i * Math.PI / 4), 'arc'); },
    ellipse: (x, y, rx, ry, rot = 0) => { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, px = rx * Math.cos(a), py = ry * Math.sin(a); pt(x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot), 'ellipse'); } },
    fillText: (t, x, y) => pt(x, textTop(y), `text ${t} ${font}px ${base}`), strokeText: (t, x, y) => pt(x, textTop(y), `text ${t} ${font}px ${base}`),
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => k === 'measureText' ? () => ({ width: 1 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : ops[k] ?? (() => {}),
    set: (_t, k: string, v) => { if (k === 'font') font = parseFloat(String(v).match(/([\d.]+)px/)?.[1] ?? '10'); if (k === 'textBaseline') base = String(v); return true; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, top: () => top, where: () => where };
}
