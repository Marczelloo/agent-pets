// Act 1 (bars 1-2): cold open. Clawd is waiting for you, knocks on the glass, the camera pulls back, and you are somewhere else.
import { at, BEAT } from './beat';
import { camPath, fit, still, type Cam, type CamFn } from './camera';
import type { Ctx } from './ctx';
import { wander } from './cursor';
import type { Format } from './format';
import { drawBubble, drawCaption, drawRipple, drawWord } from './overlays';
import { clamp, easeInOut, easeOut, easeOutBack } from './util';
import { PAL } from './world';

/** Times of Clawd's knocks (global seconds). Three in the close-up, then three more once we have pulled back. */
export const KNOCKS = [0, BEAT, 2 * BEAT, at(2, 1), at(2, 2), at(2, 3)];
export const PULL_BACK = at(2, 0);
/** The bubble leaves when Clawd calls the crew (act 2). */
const CALL_AT = at(3, 0);

/** Close-up on Clawd and his bubble, wide shot of the whole desktop. */
export function hookCams(fmt: Format): { close: Cam; wide: Cam } {
  const p = fmt.portrait;
  return {
    close: p ? fit({ x0: -76, x1: 90, y0: -112, y1: 8 }, fmt, { ground: 1500 }) : fit({ x0: -92, x1: 132, y0: -108, y1: 8 }, fmt, { top: 250 }),
    wide: p ? fit({ x0: -175, x1: 400, y0: -560, y1: 70 }, fmt, { ground: 1480 }) : fit({ x0: -470, x1: 660, y0: -560, y1: 70 }, fmt, { top: 10, bottom: 20 }),
  };
}

export function hookCamera(fmt: Format): CamFn {
  const { close, wide } = hookCams(fmt);
  // a slow creep in on Clawd, then a quick pull-back on the bar line that overshoots a hair
  const creep: Cam = { ...close, z: close.z * 1.045 };
  return camPath([[0, still(close)], [PULL_BACK - 0.05, still(creep), easeInOut], [PULL_BACK + 0.95, still(wide), t => easeOutBack(t, 1.15)]]);
}

/** How hard Clawd is hitting the glass right now: 1 on a knock, back to 0 between them. */
export function knockPhase(T: number): { hit: number; last: number } {
  let last = -1;
  for (const k of KNOCKS) if (T >= k) last = k;
  if (last < 0) return { hit: 0, last: -1 };
  return { hit: clamp(1 - (T - last) / 0.16), last };
}

export function act1(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  const { hit, last } = knockPhase(T);
  const age = last < 0 ? 9 : T - last;

  // --- Clawd: eyes on you, one arm working the glass ---
  const pull = clamp(age / (BEAT * 0.6));
  c.set('clawd', { x: 0, y: 0, z: 5 });
  c.pose('clawd', {
    th: 0, look: 0, ex: 0, bubble: 1, lean: hit > 0 ? 1 : 0.15 + 0.06 * Math.sin(T * 3),
    ikR: 1, hxR: hit > 0 ? 58 : 48 - 2 * Math.sin(pull * Math.PI), hyR: hit > 0 ? -58 : -72 + 10 * (1 - easeOut(pull)), _big: hit > 0 ? 1 : 0,
  });
  // impact marks on the exact frame of each knock
  for (const k of KNOCKS) if (T >= k && T < k + 1 / 60 + 1e-6) c.emit('clawd', { k: 'imp', x: 66, y: -58, life: 0, max: 0.35 });

  // --- the world reacts on the beat ---
  for (const k of KNOCKS) c.punches.push([k, 1]);

  // --- the user: right there, browsing, not looking ---
  const w = wander(T);
  Object.assign(c.cursor, { x: w.x, y: w.y, press: w.press, rot: w.rot });

  // --- overlays ---
  c.front.push((x, cam) => {
    const [hx, hy] = c.crew.clawd.pt(60, -58), s = clamp(cam.z / 3.2, 0.3, 1);
    KNOCKS.forEach((k, i) => {
      const lead = k <= 0 ? 0.12 : 0;
      drawRipple(x, T + lead, k, hx + 26 * s, hy, 230 * s + 30, 0.8);
      drawWord(x, T + lead * 0.75, k, hx + cam.z * 24, hy - cam.z * 6, i % 3 === 2 ? 'puk!' : 'puk', clamp(cam.z * 9, 30, 86), PAL.clay, 0.55, -0.12 + 0.05 * (i % 2));
    });
  });

  // the question, in the app's own words
  c.front.push((x, cam) => {
    const [ax, ay] = c.crew.clawd.pt(p ? 26 : 12, -80);
    drawBubble(x, { text: 'Allow Bash? npm test', ax, ay, side: 'below', size: clamp(cam.z * 6.6, 26, 64), age: 9, gone: T >= CALL_AT ? T - CALL_AT : undefined });
  });

  // --- captions: the joke is the second half, so it lands on the pull-back ---
  const cy1 = p ? 250 : 104, size = p ? 104 : 82, outAt = PULL_BACK + 0.05;
  c.front.push(x => {
    drawCaption(x, T, [
      [{ text: 'Your', t: 0, out: outAt }, { text: 'coding', t: 0, out: outAt }, { text: 'agent', t: 0, out: outAt, color: PAL.clay }],
      [{ text: 'has', t: 0, out: outAt }, { text: 'been', t: 0, out: outAt }, { text: 'waiting…', t: 0, out: outAt, color: PAL.clay }],
    ], { size, cx: fmt.W / 2, cy: cy1, lineGap: 1.1 });
    drawCaption(x, T, [
      [{ text: '…for', t: PULL_BACK + 0.35, out: at(3, 0) }, { text: '20', t: PULL_BACK + 0.5, color: PAL.clay, out: at(3, 0), k: 1.3 }, { text: 'minutes.', t: PULL_BACK + 0.62, out: at(3, 0) }],
    ], { size: size * 1.08, cx: fmt.W / 2, cy: p ? 300 : 130, lineGap: 1.1 });
  });
}
