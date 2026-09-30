// Scratch bench: pose real pets from a JSON description and grab frames. Used while authoring; the video itself is src/main.ts.
import '@fontsource-variable/fredoka';
import './fonts.css';
import { pen, setRng, SCENES, SCENES_DYNAMIC } from '@app/renderer';
import { PetPainter } from '@app/renderer/painter';
import { petFor, type SceneKey } from '@app/stage/sceneFor';
import type { Agent, Look } from '@app/types';

interface LabPet {
  agent: Agent; scene: string; name?: string; x: number; y?: number; u: number; style?: Look['style']; motion?: Look['motion'];
  /** JS body returning pose params from (t, a); used when scene === 'puppet' */
  drive?: string; setup?: string;
}
interface LabConfig { w: number; h: number; ground: number; fps: number; frames: number; grab: number[]; pets: LabPet[]; bg?: string; taskbar?: boolean }

let seed = 7;
setRng(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; });
pen.font = 'Segoe UI';

// the puppet scene: the timeline writes pose parameters into pet.drive every frame
const puppet = { base: {}, acts: [['puppet', 1e9, (_a: number, c: any) => c.drive ?? {}]] };
(SCENES as Record<string, unknown>).puppet = puppet;
(SCENES_DYNAMIC as Record<string, unknown>).puppet = puppet;

const c = document.getElementById('c') as HTMLCanvasElement;
const x = c.getContext('2d')!;

async function run(cfg: LabConfig): Promise<string[]> {
  await Promise.all([document.fonts.load('700 60px "Fredoka Variable"'), document.fonts.load('600 16px "Segoe UI"')]);
  c.width = cfg.w; c.height = cfg.h;
  seed = 7;
  const painters = cfg.pets.map(p => new PetPainter(petFor({ agent: p.agent, agent_name: p.name ?? null }, p.scene as SceneKey)));
  const drives = cfg.pets.map(p => p.drive ? (new Function('t', 'a', 'pet', p.drive) as (t: number, a: number, pet: any) => Record<string, unknown>) : null);
  cfg.pets.forEach((p, i) => { if (p.setup) new Function('pet', p.setup)(painters[i].pet); });
  const dt = 1 / cfg.fps, out: string[] = [];
  let T = 0;
  for (let f = 0; f <= Math.max(cfg.frames, ...cfg.grab); f++) {
    T += dt;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = cfg.bg ?? '#FBF1E8'; x.fillRect(0, 0, cfg.w, cfg.h);
    if (cfg.taskbar !== false) { x.fillStyle = '#1F1C1A'; x.beginPath(); x.roundRect(20, cfg.ground, cfg.w - 40, cfg.h - cfg.ground - 10, 14); x.fill(); }
    cfg.pets.forEach((p, i) => {
      const pet = painters[i].pet as any;
      if (drives[i]) pet.drive = drives[i]!(T, T, pet);
      painters[i].frame(x, {
        dt, t0: T, X: p.x, Y: p.y ?? cfg.ground, u: p.u, look: { style: p.style ?? 'clean', motion: p.motion ?? 'calm' }, animate: true, saving: false, reduced: false, dpr: 1,
      });
    });
    if (cfg.grab.includes(f)) out.push(c.toDataURL('image/png'));
  }
  return out;
}
(window as unknown as { lab: unknown }).lab = { run };
