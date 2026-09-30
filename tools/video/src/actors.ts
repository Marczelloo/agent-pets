// Actors: the app's real pets (same skins, rig, springs and props as on a taskbar) placed in the video's world.
import { pen, SCENES, SCENES_DYNAMIC, setScene } from '@app/renderer';
import { PetPainter } from '@app/renderer/painter';
import { SKINS } from '@app/skins';
import { petFor, type SceneKey } from '@app/stage/sceneFor';
import type { Agent, Look } from '@app/types';
import { worldToScreen, type Cam } from './camera';
import type { Format } from './format';

export type Who = 'clawd' | 'kodek' | 'opencode' | 'copilot' | 'android' | 'cursor' | 'grok' | 'zcode' | 'kilo';
export const CREW: Who[] = ['clawd', 'kodek', 'opencode', 'copilot', 'android', 'cursor', 'grok', 'zcode', 'kilo'];

const SOURCE: Record<Who, { agent: Agent; name?: string }> = {
  clawd: { agent: 'claude' }, kodek: { agent: 'codex' }, opencode: { agent: 'opencode' }, copilot: { agent: 'copilot' },
  android: { agent: 'antigravity' }, cursor: { agent: 'cursor' }, grok: { agent: 'grok' }, zcode: { agent: 'zcode' },
  kilo: { agent: 'other', name: 'Any agent' },
};

// The puppet scene: the timeline writes pose parameters into pet.drive every frame and the pet's own springs follow them.
// Registered in both choreography tables so a pet can switch to Dynamic motion (impact frames, sparks) mid-scene.
const PUPPET = { base: {}, acts: [['puppet', 1e9, (_a: number, c: { drive?: Record<string, unknown> }) => c.drive ?? {}]] };
(SCENES as Record<string, unknown>).puppet = PUPPET;
(SCENES_DYNAMIC as Record<string, unknown>).puppet = PUPPET;

pen.font = '"Segoe UI"';

export const CLEAN: Look = { style: 'clean', motion: 'calm' };

export interface Group { px: number; py: number; rot: number }

export interface Spec {
  /** feet position in world pu (y = 0 is the taskbar top, negative is up) */
  x: number; y: number;
  /** size multiplier on top of the camera zoom (minis are .55) */
  s: number;
  alpha: number;
  /** rotation (rad) and squash/stretch applied around the feet */
  rot: number; sx: number; sy: number;
  scene: string;
  drive: Record<string, unknown>;
  look: Look;
  z: number;
  hidden: boolean;
  /** rotation of a whole stack (tower wobble) around a world pivot */
  group?: Group;
}

export const blank = (): Spec => ({ x: 0, y: 0, s: 1, alpha: 1, rot: 0, sx: 1, sy: 1, scene: 'puppet', drive: {}, look: CLEAN, z: 0, hidden: false });

export class Actor {
  readonly painter: PetPainter;
  spec: Spec = blank();
  /** transform used for the last draw, to turn pet-local points into screen points */
  m = new DOMMatrix();
  private scene = '';
  private wasHidden = true;
  private lastU = 1;
  private lastXY: [number, number] = [0, 0];

  constructor(readonly who: Who) {
    this.painter = new PetPainter(petFor({ agent: SOURCE[who].agent, agent_name: SOURCE[who].name ?? null }, 'idle' as SceneKey));
  }

  get pet() { return this.painter.pet as unknown as Record<string, any>; }
  /** pixels per pu of the last draw (camera zoom times the actor's own scale) */
  get u(): number { return this.lastU; }
  get skin() { return SKINS[this.painter.pet.type]; }

  /** Height of the body's top above the feet in pu (legs included), at scale 1 and standing. */
  get topPu(): number { const k = this.skin; return ((k.legs.length ? (k.legLen ?? 17) - 5 : 0) + k.height) + (k.float ? 9 : 0); }

  draw(x: CanvasRenderingContext2D, cam: Cam, fmt: Format, dt: number, T: number): void {
    const s = this.spec;
    if (s.hidden || s.alpha <= 0.002) { this.wasHidden = true; return; }
    // the puppet reads pet.drive when the scene starts, so the pose must be in place before an instant scene switch
    this.pet.drive = s.drive;
    this.pet.alpha = s.alpha;
    if (s.scene !== this.scene || this.wasHidden) { setScene(this.painter.pet, s.scene, this.wasHidden); this.scene = s.scene; this.wasHidden = false; }
    const [X, Y] = worldToScreen(cam, fmt, s.x, s.y), u = cam.z * s.s;
    this.lastU = u; this.lastXY = [X, Y];
    x.save();
    if (s.group) {
      const [gx, gy] = worldToScreen(cam, fmt, s.group.px, s.group.py);
      x.translate(gx, gy); x.rotate(s.group.rot); x.translate(-gx, -gy);
    }
    x.translate(X, Y); x.rotate(s.rot); x.scale(s.sx, s.sy); x.translate(-X, -Y);
    this.m = x.getTransform();
    this.painter.frame(x, { dt, t0: T, X, Y, u, look: s.look, animate: true, saving: false, reduced: false, dpr: 1 });
    x.restore();
  }

  /** Screen position of a point given in pet-local pu (origin at the feet, x right, y down; same units as hxR, hoop, face). */
  pt(lx: number, ly: number): [number, number] {
    const [X, Y] = this.lastXY, u = this.lastU, off = (this.pet.p?.lx?.x ?? 0) * u;
    const p = this.m.transformPoint(new DOMPoint(X + off + lx * u, Y + ly * u));
    return [p.x, p.y];
  }
}

export function makeCrew(): Record<Who, Actor> {
  const out = {} as Record<Who, Actor>;
  for (const w of CREW) out[w] = new Actor(w);
  return out;
}
