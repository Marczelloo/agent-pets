// Act 1 (bars 1-2): cold open. Clawd is waiting for you, knocks on the glass, the camera pulls back, and you are somewhere else.
import { at, HEY } from './beat';
import { CALL } from './act2';
import { fit, type Cam } from './camera';
import type { Ctx } from './ctx';
import { wander } from './cursor';
import type { Format } from './format';
import { drawBubble, drawCaption, drawRipple, drawTyped, drawWord } from './overlays';
import { clamp, easeOut } from './util';
import { heightOf, landing } from './tower';
import { PAL } from './world';

/** Clawd's knocks, from the first frame and in the music's grid: quarter notes, then eighths, then sixteenths, louder all the way (v = how hard, 0..1). */
export const KNOCKS = [0, 0.5, 1, 1.5, 2, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4, 4.125, 4.25, 4.375];
export const KNOCK_V = KNOCKS.map((_, i) => 0.2 + 0.8 * i / (KNOCKS.length - 1));

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
  const waiting = T < CALL - 0.001;

  if (waiting) {
    // --- Clawd: eyes on you, one arm working the glass, leaning in harder as it drags on ---
    const pull = clamp(age / 0.35);
    c.set('clawd', { x: 0, y: 0, z: 5 });
    if (T < HEY) c.pose('clawd', {
      th: 0, look: 0, ex: 0, bubble: 1, lean: hit > 0 ? 0.35 + 0.65 * v : 0.12 + 0.06 * Math.sin(T * 3),
      ikR: 1, hxR: hit > 0 ? 58 : 48 - 2 * Math.sin(pull * Math.PI), hyR: hit > 0 ? -58 : -72 + 10 * (1 - easeOut(pull)), _big: hit > 0 && v > 0.5 ? 1 : 0,
    });
    else if (T < 5.4) c.pose('clawd', { th: 0, look: -0.2, ex: 0, bubble: 1, lean: 1, armL: 2.6, armR: 2.6, oscL: 0.25, oscR: 0.25, _f: 9 });   // HEY!, both arms up
    else if (T < 5.68) {                                                                                                                      // resignation: the arms drop, the body sags
      const k = easeOut(clamp((T - 5.4) / 0.25));
      c.set('clawd', { sy: 1 - 0.1 * k, sx: 1 + 0.05 * k });
      c.pose('clawd', { th: 0, look: -0.9, ex: 0, bubble: 0, lean: -0.3 * k, armL: 0.15, armR: 0.15, squint: 0.3 * k });
    } else {                                                                                                                                   // a hop that lands on the downbeat
      const u = clamp((T - 5.68) / (CALL - 5.68)), crouch = T < 5.75 ? 0.12 : 0;
      c.set('clawd', { y: -46 * 4 * u * (1 - u), sy: 1 - crouch, sx: 1 + crouch * 0.5 });
      c.pose('clawd', { th: 0, look: -0.3, ex: 0, bubble: 0, armL: 2.7, armR: 2.7, oscL: 0.5, oscR: 0.5, _f: 14 });
    }
    KNOCKS.forEach((k, i) => { if (KNOCK_V[i] > 0.4 && T >= k && T < k + 1 / 60 + 1e-6) c.emit('clawd', { k: 'imp', x: 66, y: -58, life: 0, max: 0.35 }); });
    // the world flinches a little more with every knock, and HEY! is a hit
    KNOCKS.forEach((k, i) => c.punches.push([k, KNOCK_V[i] * KNOCK_V[i]]));
    c.punches.push([HEY, 2.2]);
    // --- the user: right there, typing, not looking ---
    const w = wander(T);
    Object.assign(c.cursor, { x: w.x, y: w.y, press: w.press, rot: w.rot });
  }
  void landing;

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
    drawBubble(x, { text: 'Allow Bash? npm test', ax, ay, side: 'below', size: clamp(cam.z * 6.6, 26, 64), age: 9, gone: T >= HEY ? T - HEY : undefined });
  });

  // --- captions: the second half is the joke, and it clears the screen for HEY! ---
  const cy1 = p ? 250 : 104, size = p ? 104 : 82;
  c.front.push(x => {
    drawCaption(x, T, [
      [{ text: 'Your', t: 0.3, out: 2.35 }, { text: 'coding', t: 0.42, out: 2.35 }, { text: 'agent', t: 0.54, out: 2.35, color: PAL.clay }],
      [{ text: 'has', t: 0.8, out: 2.35 }, { text: 'been', t: 0.92, out: 2.35 }, { text: 'waiting…', t: 1.04, out: 2.35, color: PAL.clay }],
    ], { size, cx: fmt.W / 2, cy: cy1, lineGap: 1.1 });
    drawCaption(x, T, [
      [{ text: '…for', t: 2.5, out: 4.1 }, { text: '20', t: 2.62, color: PAL.clay, out: 4.1, k: 1.3 }, { text: 'minutes.', t: 2.76, out: 4.1 }],
    ], { size: size * 1.08, cx: fmt.W / 2, cy: cy1 + size * 0.55, lineGap: 1.1 });
  });

  // HEY!, held for a second while the cursor carries on typing
  c.front.push((x, cam) => {
    const [hx, hy] = c.crew.clawd.pt(-4, -heightOf('clawd') - 30);
    drawWord(x, T, HEY, hx + 20, hy - 46, 'HEY!', clamp(cam.z * 30, 72, 140), PAL.clay, 1.0, -0.1);
  });
  // the answer is typed in once he has given up
  c.front.push(x => {
    drawTyped(x, T, [{ text: 'So it called the whole ' }, { text: 'crew.', color: PAL.clay }], { t0: 5.5, cps: 20, out: at(5, 3), size: p ? 62 : 68, cx: fmt.W / 2, cy: p ? 190 : 72 });
  });
}
