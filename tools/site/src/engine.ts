// The app's real pets, placed on the page's canvases. One clock drives every visible stage.
import { pen, setScene } from '@app/renderer';
import { PetPainter } from '@app/renderer/painter';
import { drawBubble, measureBubble } from '@app/renderer/bubble';
import { SKINS } from '@app/skins';
import { ACCENT } from '@app/styles';
import { petFor, type SceneKey } from '@app/stage/sceneFor';
import type { Agent, Look } from '@app/types';
import './scenes';

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
pen.font = '"Nunito", "Segoe UI", system-ui, sans-serif';

export type Who = 'clawd' | 'kodek' | 'opencode' | 'copilot' | 'android' | 'cursor' | 'grok' | 'zcode' | 'blob';
export const CREW: { who: Who; agent: Agent; label: string; pet: string; name?: string }[] = [
  { who: 'clawd', agent: 'claude', label: 'Claude Code', pet: 'Clawd' },
  { who: 'kodek', agent: 'codex', label: 'Codex', pet: 'Kodek' },
  { who: 'opencode', agent: 'opencode', label: 'opencode', pet: 'cyclops' },
  { who: 'copilot', agent: 'copilot', label: 'GitHub Copilot', pet: 'pilot' },
  { who: 'android', agent: 'antigravity', label: 'Antigravity', pet: 'Android' },
  { who: 'cursor', agent: 'cursor', label: 'Cursor', pet: 'block' },
  { who: 'grok', agent: 'grok', label: 'Grok Build', pet: 'robot' },
  { who: 'zcode', agent: 'zcode', label: 'ZCode', pet: 'panda' },
  { who: 'blob', agent: 'other', label: 'Any agent', pet: 'blob', name: 'Any agent' },
];
export const crewOf = (who: Who) => CREW.find(c => c.who === who)!;

export const CLEAN: Look = { style: 'clean', motion: 'calm' };

/** A pet on a page canvas: position in CSS px (feet), size `u`, a scene, and a little squash and drop of its own. */
export class Actor {
  painter: PetPainter;
  scene: string;
  x = 0; y = 0; u = 1; alpha = 1; look: Look = CLEAN;
  /** extra vertical offset (px) for drops and hops, and squash: >0 wide and flat, <0 tall and thin */
  dy = 0; vy = 0; squash = 0; sv = 0;
  flip = false;
  hidden = false;
  private back: string | null = null;
  private backT = 0;
  private fresh = true;

  constructor(readonly agent: Agent, scene: string, readonly name: string | null = null) {
    this.painter = new PetPainter(petFor({ agent, agent_name: name }, scene as SceneKey));
    this.scene = scene;
  }

  get pet(): Record<string, any> { return this.painter.pet as any; }
  get skin() { return SKINS[this.painter.pet.type]; }
  get accent(): string { return this.pet.accent ?? ACCENT[this.painter.pet.type]; }
  /** height of the body's top above the feet, in px at the current size */
  get height(): number { const k = this.skin; return (((k.legs.length ? (k.legLen ?? 17) - 5 : 0) + k.height) + (k.float ? 9 : 0)) * this.u; }
  get width(): number { return this.skin.width * this.u; }

  set(scene: string, instant = false): void {
    this.back = null;
    if (scene === this.scene && !instant) return;
    this.scene = scene;
    setScene(this.painter.pet, scene, instant || REDUCED);
  }

  /** play a scene for a while, then go back to the current one */
  poke(scene = 'done', secs = 2.6): void {
    const home = this.back ?? this.scene;
    this.set(scene);
    this.back = home; this.backT = secs;
    this.hop(220);
  }

  /** an upward kick (px/s) with a stretch */
  hop(v = 260): void { if (REDUCED) return; this.vy = -v; this.squash = -.18; }
  /** start above its spot and fall onto it */
  drop(h: number): void { if (REDUCED) return; this.dy = -h; this.vy = 0; }

  step(dt: number): void {
    if (this.back != null) { this.backT -= dt; if (this.backT <= 0) { const b = this.back; this.back = null; this.set(b); } }
    if (this.dy < 0 || this.vy !== 0) {
      this.vy += 2600 * dt; this.dy += this.vy * dt;
      if (this.dy >= 0) { this.squash = Math.min(.35, this.vy / 2400); this.dy = 0; this.vy = 0; }
    }
    // squash springs back with a wobble
    this.sv += (-this.squash * 420 - this.sv * 16) * dt; this.squash += this.sv * dt;
  }

  draw(x: CanvasRenderingContext2D, dt: number, T: number, dpr: number): void {
    if (this.hidden || this.alpha <= .01) return;
    this.pet.alpha = this.alpha;
    const X = this.x, Y = this.y + this.dy, k = this.squash;
    x.save();
    if (k || this.flip) { x.translate(X, Y); x.scale((this.flip ? -1 : 1) * (1 + k), 1 - k); x.translate(-X, -Y); }
    this.painter.frame(x, { dt: this.fresh ? 0 : dt, t0: T, X, Y, u: this.u, look: this.look, animate: !REDUCED, saving: false, reduced: REDUCED, dpr });
    x.restore();
    this.fresh = false;
  }

  /** draw again in the same frame (another look, another clip) without moving the clock */
  redraw(x: CanvasRenderingContext2D, T: number, dpr: number, look: Look): void {
    this.painter.frame(x, { dt: 0, t0: T, X: this.x, Y: this.y + this.dy, u: this.u, look, animate: !REDUCED, saving: false, reduced: REDUCED, dpr });
  }

  hit(px: number, py: number, pad = 6): boolean {
    const w = this.width / 2 + pad, top = this.y + this.dy - this.height - pad;
    return px > this.x - w && px < this.x + w && py > top && py < this.y + pad;
  }
}

/** A speech bubble from the app, above a pet. Returns its box. */
export function bubble(x: CanvasRenderingContext2D, a: Actor, text: string, kind: 'question' | 'action', zoom: number, dpr: number, W: number, look: Look = CLEAN, lift = 10) {
  const b = measureBubble(x, text, look, zoom, dpr);
  const bx = Math.max(6, Math.min(W - b.w - 6, a.x - b.w / 2));
  const by = a.y + a.dy - a.height - b.h - lift * zoom;
  drawBubble(x, bx, by, text, kind, look, a.x - bx, zoom, dpr, a.accent);
  return { x: bx, y: by, w: b.w, h: b.h };
}

// ───────── stages ─────────

export interface Pointer { x: number; y: number; in: boolean }
export class Stage {
  readonly x: CanvasRenderingContext2D;
  w = 0; h = 0; dpr = 1;
  visible = false;
  readonly always: boolean;
  pointer: Pointer = { x: -1, y: -1, in: false };
  onClick?: (px: number, py: number) => void;
  onResize?: () => void;

  constructor(readonly canvas: HTMLCanvasElement, readonly paint: (s: Stage, dt: number, T: number) => void, opts: { always?: boolean; interactive?: boolean } = {}) {
    this.x = canvas.getContext('2d')!;
    this.always = !!opts.always;
    this.visible = this.always;
    STAGES.push(this);
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    if (opts.interactive !== false) {
      const local = (e: PointerEvent | MouseEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('pointermove', e => { const [px, py] = local(e); this.pointer = { x: px, y: py, in: true }; });
      canvas.addEventListener('pointerleave', () => { this.pointer = { ...this.pointer, in: false }; });
      canvas.addEventListener('click', e => { const [px, py] = local(e); this.onClick?.(px, py); });
    }
  }

  dispose(): void { const i = STAGES.indexOf(this); if (i >= 0) STAGES.splice(i, 1); }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    // assigning a canvas size clears it, even to the same value: only when it really changes
    const W = Math.max(1, Math.round(r.width * this.dpr)), H = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== W) this.canvas.width = W;
    if (this.canvas.height !== H) this.canvas.height = H;
    this.onResize?.();
    // a ResizeObserver runs after this frame was drawn: draw it again, or a growing canvas stays blank
    if (this.visible && this.w > 0) this.frame(0, T);
  }

  frame(dt: number, T: number): void {
    const x = this.x;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, this.w, this.h);
    this.paint(this, dt, T);
  }
}

const STAGES: Stage[] = [];
let T = 0, last = 0, pageVisible = true;
document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });

export function run(): void {
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (!pageVisible) { last = now; return; }
    const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60;
    // reduced motion: a still picture, refreshed only now and then for scene changes
    if (REDUCED && last && now - last < 250) return;
    last = now; T += dt;
    // Draw only what is on screen. Measured every frame rather than with an IntersectionObserver, which can stay
    // silent inside a cross-origin iframe (a preview) for a canvas added after load.
    const vh = window.innerHeight;
    for (const s of STAGES) {
      if (!s.always) { const r = s.canvas.getBoundingClientRect(); s.visible = r.bottom > -100 && r.top < vh + 100 && r.width > 0; }
      if (s.visible && s.w > 0) s.frame(dt, T);
    }
  };
  requestAnimationFrame(loop);
}

/** The page's colour tokens as the canvases see them, refreshed when the theme changes. */
export const tone: Record<string, string> = {};
const TOKENS = ['paper', 'paper-2', 'ink', 'ink-2', 'line', 'card', 'bar', 'bar-ink', 'bar-2', 'stage-bar', 'clay', 'teal', 'sky', 'amber', 'leaf', 'mute'];
function readTone() { const cs = getComputedStyle(document.documentElement); TOKENS.forEach(t => { tone[t] = cs.getPropertyValue(`--${t}`).trim(); }); }
readTone();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTone);
new MutationObserver(readTone).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
export const MONO = '"JetBrains Mono", Consolas, monospace';
export const BODY = '"Nunito", "Segoe UI", system-ui, sans-serif';
