// The camera while the crew arrives: it starts in close-up on Clawd's landing and backs away a little before each landing, just
// enough that everyone who has landed stays in frame, and stops when the crew is complete. A pure function of time.
import { hookCams } from './act1';
import { CALL, rainCam } from './act2';
import { mixCam, worldToScreen, type Cam, type CamFn } from './camera';
import type { Format } from './format';
import { ANDROID_LAND, heightOf, slotPose, SLOTS, ZCODE } from './tower';
import { clamp } from './util';
import type { Who } from './actors';

const smooth = (u: number) => { const c = clamp(u); return c * c * (3 - 2 * c); };

export const CREW_DONE = ANDROID_LAND + 0.5;

export function crewCam(fmt: Format): CamFn {
  const { close } = hookCams(fmt), rain = rainCam(fmt)(0);
  const ev: { t: number; who: Who; x: number; y: number }[] = [
    ...SLOTS.map(s => ({ t: s.land, who: s.who, x: s.x, y: slotPose(s.land + 0.9, s).y })),
    { t: ZCODE.land, who: 'zcode' as Who, x: ZCODE.x, y: 0 },
  ].sort((a, b) => a.t - b.t);
  const capTop = fmt.portrait ? 330 : 170, sideM = fmt.W * 0.07, bottom = fmt.H * 0.94;
  const fits = (cam: Cam, n: number): boolean => {
    let x0 = -62, x1 = 62, y0 = -40, y1 = 14;
    for (let i = 0; i <= n; i++) { const e = ev[i]; x0 = Math.min(x0, e.x - 62); x1 = Math.max(x1, e.x + 62); y0 = Math.min(y0, e.y - heightOf(e.who) - 36); }
    const [ax, ay] = worldToScreen(cam, fmt, x0, y0), [bx, by] = worldToScreen(cam, fmt, x1, y1);
    return ax >= sideM && bx <= fmt.W - sideM && ay >= capTop && by <= bottom;
  };
  // the least zoomed-out blend of the close-up and the final framing that still holds everyone who has landed
  const need: number[] = []; let prev = 0;
  for (let n = 0; n < ev.length; n++) {
    let lo = prev, hi = 1;
    if (fits(mixCam(close, rain, lo), n)) need.push(lo);
    else { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mixCam(close, rain, mid), n)) hi = mid; else lo = mid; } need.push(hi); }
    prev = need[n];
  }
  const steps: { t0: number; d: number; dk: number }[] = []; prev = 0;
  ev.forEach((e, n) => { if (need[n] > prev) steps.push({ t0: e.t - 0.55, d: 0.75, dk: need[n] - prev }); prev = Math.max(prev, need[n]); });
  steps.push({ t0: ANDROID_LAND - 0.3, d: 1.4, dk: 1 - prev });
  return t => {
    let k = 0;
    for (const s of steps) k += s.dk * smooth((t - s.t0) / s.d);
    return mixCam(close, rain, clamp(k));
  };
}

export { CALL };
