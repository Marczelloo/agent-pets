// The whole video as one function of time. Each act owns a stretch of it; see ctx.ts for how they cooperate.
import { blank, makeCrew, CREW, type Who } from './actors';
import { act1, dolly, hookCams } from './act1';
import { act2, CALL } from './act2';
import { CREW_DONE, crewCam } from './crewcam';
import { HEY } from './beat';
import { camPath, still, worldToScreen, type Cam, type CamFn } from './camera';
import type { Ctx } from './ctx';
import { act3 } from './act3';
import type { Format } from './format';
import type { Limit } from '@app/types';
import { clamp, ring } from './util';
import { DARK } from './themes';
import { setInk } from './overlays';
import { drawBackdrop, drawCursor, drawTaskbar } from './world';
import { act4 } from './act4';
import { act5, camKeys as endKeys, END } from './act5';
import { act3Cam } from './act3';

export const DURATION = END;

const LIMITS: Limit[] = [
  { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: null }, { agent: 'claude', window: 'weekly', used_pct: 61, resets_at: null },
  { agent: 'codex', window: 'five_hour', used_pct: 12, resets_at: null }, { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: null },
];

export class Story {
  readonly crew = makeCrew();
  private cam: CamFn;

  constructor(readonly fmt: Format) {
    const { close, wide } = hookCams(fmt);
    this.cam = camPath([
      // one continuous move: wide on the desktop, easing toward Clawd faster and faster, arriving on HEY!
      [0, still(wide)], [HEY, still(close), dolly], [CALL, crewCam(fmt)], [CREW_DONE, crewCam(fmt)],
      ...act3Cam(fmt), ...endKeys(fmt),
    ]);
  }

  /** Draw the frame at time T. Frames must be rendered in order: the pets keep their own spring state between frames. */
  render(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt, crew } = this;
    for (const w of CREW) { const a = crew[w]; a.spec = blank(); a.spec.hidden = true; }
    const c: Ctx = {
      T, fmt, crew, back: [], front: [], top: [], punches: [], theme: DARK, windows: 1, bars: [],
      reset: (w: Who) => { crew[w].spec.drive = {}; },
      cursor: { x: 0, y: -400, rot: 0, size: 44, alpha: 1, press: 0 },
      set: (w: Who, p) => Object.assign(crew[w].spec, { hidden: false }, p),
      pose: (w: Who, params) => { Object.assign(crew[w].spec.drive, params); },
      emit: (w: Who, part) => { (crew[w].pet.parts as unknown[]).push(part); },
    };
    act1(c);
    act2(c);
    act3(c);
    act4(c);
    act5(c);

    // camera, with each knock punching the zoom and shaking the frame a little
    const base = this.cam(T);
    let punch = 0, sx = 0, sy = 0;
    for (const [t, s] of c.punches) {
      const age = T - t;
      if (age < 0 || age > 0.6) continue;
      punch += 0.03 * s * Math.exp(-age * 13);
      sx += s * 5 * ring(age, 1, 11, 9); sy += s * 3 * ring(age, 1, 9, 10);
    }
    const cam: Cam = { x: base.x + sx / base.z, y: base.y + sy / base.z, z: base.z * (1 + punch) };

    setInk(c.theme.text);
    drawBackdrop(x, fmt, cam, T, c.theme, c.wipe, c.windows * clamp((7.4 - cam.z) / 3.4));
    drawTaskbar(x, fmt, cam, T, { limits: LIMITS, bars: c.bars });
    for (const o of c.back) o(x, cam);
    const order = CREW.map(w => crew[w]).sort((a, b) => a.spec.z - b.spec.z);
    for (const a of order) a.draw(x, cam, fmt, dt, T);
    for (const o of c.front) o(x, cam);
    const cur = c.cursor, late = cur.late?.(cam), [cx, cy] = late?.screen ?? worldToScreen(cam, fmt, cur.x, cur.y);
    drawCursor(x, cx, cy, (late?.size ?? cur.size) * cam.z, late?.rot ?? cur.rot, cur.alpha * clamp(1), late?.press ?? cur.press);
    for (const o of c.top) o(x, cam);
  }
}
