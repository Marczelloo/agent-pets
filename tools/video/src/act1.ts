// Act 1 (bars 1-2): cold open. Clawd is waiting for you, knocks on the glass, the camera pulls back, and you are somewhere else.
import { CALL } from './act2';
import { fit, type Cam } from './camera';
import type { Ctx } from './ctx';
import { wander } from './cursor';
import type { Format } from './format';
import { drawBubble, drawCaption, drawRipple, drawWord } from './overlays';
import { clamp, easeOut } from './util';
import { PAL } from './world';

/** Clawd's knocks, from the first frame: rare and quiet at first, then closer together and harder (v = how hard, 0..1). */
export const KNOCKS = [0, 1.1, 2.0, 2.7, 3.25, 3.7, 4.05, 4.3];
export const KNOCK_V = [0.22, 0.3, 0.4, 0.52, 0.65, 0.78, 0.9, 1];
/** The bubble leaves when Clawd calls the crew (act 2). */
const CALL_AT = CALL;

/** Close-up on Clawd and his bubble, wide shot of the whole desktop. */
export function hookCams(fmt: Format): { close: Cam; wide: Cam } {
  const p = fmt.portrait;
  return {
    close: p ? fit({ x0: -76, x1: 90, y0: -112, y1: 8 }, fmt, { ground: 1500 }) : fit({ x0: -92, x1: 132, y0: -108, y1: 8 }, fmt, { top: 250 }),
    wide: p ? fit({ x0: -175, x1: 400, y0: -560, y1: 70 }, fmt, { ground: 1480 }) : fit({ x0: -470, x1: 660, y0: -560, y1: 70 }, fmt, { top: 10, bottom: 20 }),
  };
}

/** How hard Clawd is hitting the glass right now: 1 on a knock, back to 0 between them, and how hard that knock is. */
export function knockPhase(T: number): { hit: number; last: number; v: number } {
  let i = -1;
  for (let k = 0; k < KNOCKS.length; k++) if (T >= KNOCKS[k]) i = k;
  if (i < 0) return { hit: 0, last: -1, v: 0 };
  return { hit: clamp(1 - (T - KNOCKS[i]) / 0.16), last: KNOCKS[i], v: KNOCK_V[i] };
}

/** The whole opening is one move: wide on the desktop, easing into Clawd, faster and faster, arriving on the beat. */
export const dolly = (u: number): number => { const e = Math.pow(u, 1.5); return e * e * (3 - 2 * e); };

export function act1(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  const { hit, last, v } = knockPhase(T);
  const age = last < 0 ? 9 : T - last;
  const waiting = T < CALL - 0.01;

  if (waiting) {
    // --- Clawd: eyes on you, one arm working the glass, leaning in harder as it drags on ---
    const pull = clamp(age / 0.35);
    c.set('clawd', { x: 0, y: 0, z: 5 });
    c.pose('clawd', {
      th: 0, look: 0, ex: 0, bubble: 1, lean: hit > 0 ? 0.35 + 0.65 * v : 0.12 + 0.06 * Math.sin(T * 3),
      ikR: 1, hxR: hit > 0 ? 58 : 48 - 2 * Math.sin(pull * Math.PI), hyR: hit > 0 ? -58 : -72 + 10 * (1 - easeOut(pull)), _big: hit > 0 && v > 0.5 ? 1 : 0,
    });
    KNOCKS.forEach((k, i) => { if (KNOCK_V[i] > 0.4 && T >= k && T < k + 1 / 60 + 1e-6) c.emit('clawd', { k: 'imp', x: 66, y: -58, life: 0, max: 0.35 }); });
    // the world flinches a little more with every knock
    KNOCKS.forEach((k, i) => c.punches.push([k, KNOCK_V[i] * KNOCK_V[i]]));
    // --- the user: right there, browsing, not looking ---
    const w = wander(T);
    Object.assign(c.cursor, { x: w.x, y: w.y, press: w.press, rot: w.rot });
  }

  // --- overlays ---
  c.front.push((x, cam) => {
    const [hx, hy] = c.crew.clawd.pt(60, -58), s = clamp(cam.z / 3.2, 0.3, 1);
    KNOCKS.forEach((k, i) => {
      const q = KNOCK_V[i], lead = k <= 0 ? 0.12 : 0;
      drawRipple(x, T + lead, k, hx + 26 * s, hy, (230 * s + 30) * (0.4 + 0.6 * q), 0.8 * (0.35 + 0.65 * q));
      drawWord(x, T + lead * 0.75, k, hx + cam.z * 24, hy - cam.z * 6, q > 0.85 ? 'puk!' : 'puk', clamp(cam.z * 9, 30, 86) * (0.55 + 0.45 * q), PAL.clay, 0.55, -0.12 + 0.05 * (i % 2));
    });
  });

  // the question, in the app's own words
  c.front.push((x, cam) => {
    const [ax, ay] = c.crew.clawd.pt(p ? 26 : 12, -80);
    drawBubble(x, { text: 'Allow Bash? npm test', ax, ay, side: 'below', size: clamp(cam.z * 6.6, 26, 64), age: 9, gone: T >= CALL_AT ? T - CALL_AT : undefined });
  });

  // --- captions: the second half is the joke, and it clears the screen for HEY! ---
  const cy1 = p ? 250 : 104, size = p ? 104 : 82;
  c.front.push(x => {
    drawCaption(x, T, [
      [{ text: 'Your', t: 0.3, out: 2.35 }, { text: 'coding', t: 0.42, out: 2.35 }, { text: 'agent', t: 0.54, out: 2.35, color: PAL.clay }],
      [{ text: 'has', t: 0.8, out: 2.35 }, { text: 'been', t: 0.92, out: 2.35 }, { text: 'waiting…', t: 1.04, out: 2.35, color: PAL.clay }],
    ], { size, cx: fmt.W / 2, cy: cy1, lineGap: 1.1 });
    drawCaption(x, T, [
      [{ text: '…for', t: 2.5, out: CALL - 0.02 }, { text: '20', t: 2.62, color: PAL.clay, out: CALL - 0.02, k: 1.3 }, { text: 'minutes.', t: 2.76, out: CALL - 0.02 }],
    ], { size: size * 1.08, cx: fmt.W / 2, cy: cy1 + size * 0.55, lineGap: 1.1 });
  });
}
