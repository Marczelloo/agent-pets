// Act 5 (bars 11-14): the group photo. The headphones fly off, the title lands, the offer, and one last knock that rhymes with the start.
import { throwPhones } from '@app/renderer';
import type { Who } from './actors';
import { at, BEAT } from './beat';
import { fit, still, type CamFn } from './camera';
import type { Ctx } from './ctx';
import type { Format } from './format';
import { drawCaption, drawRipple, drawWord } from './overlays';
import { SLOTS } from './tower';
import { clamp, easeInOut, easeOut, TAU } from './util';
import { FONT, PAL, UI_FONT } from './world';
import { partyCam } from './act2';
import { hit } from './act4';

export const TITLE = at(11, 0);
export const OFFER = at(12, 0);
export const FINE = at(12, 2);
export const END = at(14, 0);
export const LAST_KNOCK = END - 0.62;

/** Camera for the card: the crew slides to the right (landscape) or lower (portrait) to make room for the title. */
export function endCam(fmt: Format): CamFn {
  const p = fmt.portrait;
  if (p) return still(fit({ x0: -150, x1: 335, y0: -350, y1: 70 }, fmt, { ground: 1390 }));
  return still({ x: -87, y: -170, z: 2.0 });
}

export function camKeys(fmt: Format): [number, CamFn, ((t: number) => number)?][] {
  return [[TITLE - 0.05, partyCam(fmt)], [TITLE + 1.0, endCam(fmt), easeInOut]];
}

const ALL: Who[] = ['clawd', 'opencode', 'copilot', 'cursor', 'grok', 'kodek', 'kilo', 'android', 'zcode'];

export function act5(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  if (T < TITLE - 0.08) return;

  // ---------- the group photo: flash, headphones fly, everyone waves ----------
  if (T >= TITLE - 0.02) {
    // the equaliser lines go back to work-progress lines, like in the app when the music stops
    c.bars.length = 0;
    c.bars.push({ x: 0, session: { agent: 'claude', state: 'working', progress: { done: 4, total: 6 } } },
      { x: 98, session: { agent: 'codex', state: 'working', progress: null } },
      { x: 196, session: { agent: 'claude', state: 'working', progress: { done: 2, total: 6 } } });
    ALL.forEach((w, i) => {
      c.reset(w);
      const base = { armR: 2.3, oscR: 0.5, _f: 9 + (i % 4) * 1.3, happy: 0.5, look: -0.05, ex: 0, armL: 0.35 };
      if (w === 'kodek') c.pose(w, { ikL: 1, hxL: -47, hyL: -25, ikR: 1, hxR: 34, hyR: -58, _hold: 'net', pole: 0.32 + 0.08 * Math.sin(T * 2), _poleDirect: 1, happy: 0.95 });
      else if (w === 'kilo') c.pose(w, { armL: 2.6, armR: 2.6, oscL: 0.3, oscR: 0.3, _f: 10, happy: 1 });
      else if (w === 'clawd') c.pose(w, T >= LAST_KNOCK - 0.05 ? {} : { ...base, bubble: 0 });
      else c.pose(w, base);
    });
    if (T >= TITLE - 0.02 && T < TITLE - 0.02 + 1 / 60 + 1e-6) for (const w of ALL) throwPhones(c.crew[w].pet as never);
    // a gentle wave of bounces runs up the pyramid on every beat, base row first
    const a = T - TITLE;
    if (a > 0.3) for (const s of SLOTS) {
      const phase = (s.on ? 1 : s.row) * 0.2 * BEAT, k = clamp((a - 0.3) / 0.4);
      c.set(s.who, { y: c.crew[s.who].spec.y - 3.4 * hit(T - phase) * k });
    }
  }

  // ---------- one last knock, on the beat, so the loop rhymes with the cold open ----------
  if (T >= LAST_KNOCK - 0.3) {
    const k = LAST_KNOCK, a = T - k, hitK = a >= 0 && a < 0.16;
    c.reset('clawd');
    c.pose('clawd', { th: 0, look: 0, ex: 0, lean: hitK ? 1 : 0.15, ikR: 1, hxR: hitK ? 58 : 48, hyR: hitK ? -58 : -72, _big: hitK ? 1 : 0, happy: hitK ? 0 : 0.5, armL: 0.35 });
    if (T >= k && T < k + 1 / 60 + 1e-6) c.emit('clawd', { k: 'imp', x: 66, y: -58, life: 0, max: 0.35 });
    c.punches.push([k, 1]);
    c.front.push((x, cam) => {
      const [hx, hy] = c.crew.clawd.pt(60, -58), s = clamp(cam.z / 3.2, 0.3, 1);
      drawRipple(x, T, k, hx + 26 * s, hy, 230 * s + 30, 0.8);
      drawWord(x, T, k, hx + cam.z * 24, hy - cam.z * 6, 'puk', clamp(cam.z * 9, 30, 86), PAL.clay, 0.55, -0.12);
    });
  }

  // ---------- flash ----------
  c.top.push(x => {
    const a = T - TITLE;
    if (a < -0.05 || a > 0.35) return;
    x.save(); x.globalAlpha = a < 0 ? (1 + a / 0.05) * 0.6 : (1 - easeOut(a / 0.35)) * 0.6; x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, fmt.W, fmt.H); x.restore();
  });

  // ---------- the card ----------
  const ink = c.theme.text, W = fmt.W;
  c.windows = 1 - 0.88 * easeOut(clamp((T - TITLE) / 0.9));
  c.front.push(x => {
    if (p) {
      drawCaption(x, T, [[{ text: 'Agent', t: TITLE + 0.05 }], [{ text: 'Pets', t: TITLE + 0.15, color: PAL.clay }]], { size: 196, cx: W / 2, cy: 335, lineGap: 0.96 });
      drawCaption(x, T, [[{ text: 'Your', t: TITLE + 0.7 }, { text: 'coding', t: TITLE + 0.8 }, { text: 'agents,', t: TITLE + 0.9 }], [{ text: 'in', t: TITLE + 1.2 }, { text: 'your', t: TITLE + 1.3 }, { text: 'taskbar.', t: TITLE + 1.4, color: PAL.clay }]], { size: 66, cx: W / 2, cy: 612, lineGap: 1.1, weight: 600 });
    } else {
      drawCaption(x, T, [[{ text: 'Agent', t: TITLE + 0.05 }, { text: 'Pets', t: TITLE + 0.15, color: PAL.clay }]], { size: 152, cx: 108, cy: 276, lineGap: 1, align: 'left' });
      drawCaption(x, T, [[{ text: 'Your', t: TITLE + 0.7 }, { text: 'coding', t: TITLE + 0.8 }, { text: 'agents,', t: TITLE + 0.9 }], [{ text: 'in', t: TITLE + 1.2 }, { text: 'your', t: TITLE + 1.3 }, { text: 'taskbar.', t: TITLE + 1.4, color: PAL.clay }]], { size: 66, cx: 112, cy: 486, lineGap: 1.12, align: 'left', weight: 600 });
    }
    // the offer
    const oa = T - OFFER;
    if (oa > 0) {
      const pop = Math.min(1, oa / 0.35), sc = pop < 1 ? 1 + 0.12 * Math.sin(pop * Math.PI) : 1;
      const cx = p ? W / 2 : 110, cy = p ? 1615 : 690, size = p ? 50 : 44;
      x.save(); x.translate(cx, cy); x.scale(sc * easeOut(pop), sc * easeOut(pop)); x.globalAlpha = pop;
      x.font = `700 ${size}px ${FONT}`; const tw = x.measureText('Free & open source').width, pw = tw + size * 1.4, ph = size * 1.7, bx = p ? -pw / 2 : 0;
      x.fillStyle = PAL.clay; x.beginPath(); x.roundRect(bx, -ph / 2, pw, ph, ph / 2); x.fill();
      x.fillStyle = '#1A1210'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText('Free & open source', bx + size * 0.7, size * 0.04);
      x.restore();
      const ua = T - (OFFER + 0.35);
      if (ua > 0) {
        x.save(); x.globalAlpha = clamp(ua / 0.3); x.font = `700 ${p ? 44 : 40}px ${UI_FONT}`; x.fillStyle = ink; x.textBaseline = 'middle'; x.textAlign = p ? 'center' : 'left';
        x.fillText('github.com/Marczelloo/agent-pets', p ? W / 2 : 112, cy + (p ? 92 : 88)); x.restore();
      }
    }
    // the small print (the README's own disclaimers)
    const fa = T - FINE;
    if (fa > 0) {
      x.save(); x.globalAlpha = clamp(fa / 0.4) * 0.9; x.fillStyle = '#7E8AA3'; x.font = `600 ${p ? 22 : 19}px ${UI_FONT}`; x.textBaseline = 'alphabetic';
      const lines = ['Licensed under the GNU GPL v3.0.', 'Not affiliated with Anthropic, OpenAI, GitHub, Google, Cursor, xAI, Z.ai or opencode.', 'Android robot by Google, used under CC BY 3.0.'];
      lines.forEach((l, i) => { x.textAlign = p ? 'center' : 'left'; x.fillText(l, p ? W / 2 : 112, (p ? 1758 : 996) + i * (p ? 30 : 26)); });
      x.restore();
    }
  });
  void BEAT; void TAU;
}
