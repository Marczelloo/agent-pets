// Act 2 (bars 3-5): Clawd gives up on being polite and calls the crew. One pet per beat drops out of the sky onto a growing pyramid.
import { SKINS } from '@app/skins';
import { foldHW } from '@app/renderer/fold';
import type { Who } from './actors';
import { at, BEAT } from './beat';
import { fit, type CamFn } from './camera';
import type { Ctx } from './ctx';
import { wander } from './cursor';
import type { Format } from './format';
import { drawTag } from './overlays';
import { ANDROID_LAND, drop, heightOf, slotPose, SLOTS, sway, ZCODE } from './tower';
import { clamp, ring } from './util';

export const CALL = at(3, 0);
const HIP = { ikL: 1, hxL: -47, hyL: -25 };
const SHEET = (a: number) => ({ ikL: 1, hxL: -22 + 0.8 * Math.sin(a * 1.3), hyL: -19 + 0.8 * Math.sin(a * 1.7), ikR: 1, hxR: 22 + 0.8 * Math.sin(a * 1.3), hyR: -19 + 0.8 * Math.sin(a * 1.7 + 0.4) });

export const TAGS: Record<Who, { name: string; sub?: string; color: string }> = {
  clawd: { name: 'Clawd', sub: 'Claude Code', color: '#D97757' },
  opencode: { name: 'opencode', color: '#3A3535' },
  copilot: { name: 'Copilot', sub: 'GitHub', color: '#5BA8E6' },
  cursor: { name: 'Cursor', color: '#2A2A2A' },
  grok: { name: 'Grok', sub: 'Build', color: '#8A8A96' },
  kodek: { name: 'Kodek', sub: 'Codex', color: '#5DCAA5' },
  kilo: { name: 'Any agent', color: '#7FCB6A' },
  zcode: { name: 'ZCode', color: '#2F6BFF' },
  android: { name: 'Antigravity', color: '#3DDC84' },
};

/** Camera for the build: the whole pyramid, plus the sky above it where the user is. */
export function rainCam(fmt: Format): CamFn {
  const p = fmt.portrait;
  const cam = p ? fit({ x0: -150, x1: 335, y0: -450, y1: 70 }, fmt, { ground: 1500 }) : fit({ x0: -190, x1: 400, y0: -405, y1: 70 }, fmt, { top: 20, bottom: 20 });
  return () => cam;
}

/** Camera for the party and the end: the pyramid and its neighbours, nothing above (the user has left the sky). */
export function partyCam(fmt: Format): CamFn {
  const p = fmt.portrait;
  const cam = p ? fit({ x0: -150, x1: 335, y0: -350, y1: 70 }, fmt, { ground: 1500 }) : fit({ x0: -190, x1: 400, y0: -350, y1: 70 }, fmt, { top: 60, bottom: 30 });
  return () => cam;
}

/** Arms up and flailing, eyes wide: the pose of anything falling out of the sky. */
const FALLING = { armL: 2.7, armR: 2.7, oscL: 0.5, oscR: 0.5, _f: 14, look: -0.2, ex: 0 };

export function act2(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  if (T < CALL - 0.01) return;
  const landed = SLOTS.filter(s => s.land > 0 && T >= s.land).length;
  const sw = sway(T), nerv = Math.abs(sw) * 10;

  // --- Clawd: a sigh, then the call for help; then he holds the base of the pyramid, sweating ---
  const cp = slotPose(T, SLOTS[0]);
  c.set('clawd', { x: cp.x, y: cp.y, sx: cp.sx, sy: cp.sy, z: 1 });
  c.pose('clawd', { th: 0, bubble: 1, look: -0.9, ex: 0.4, armL: 2.6, armR: 2.6, oscL: 0.12, oscR: 0.12, _f: 8, squint: clamp(0.1 + landed * 0.08 + nerv, 0, 0.7) });
  // a bead of sweat for every level he is carrying
  for (const s of SLOTS) if (s.land > 0 && T >= s.land + 0.35 && T < s.land + 0.35 + 1 / 60 + 1e-6 && s.row > 0) c.emit('clawd', { k: 'drop', x: -30, y: -62, vx: -25, vy: -20, g: 160, life: 0, max: 0.8 });

  // --- the rain ---
  SLOTS.slice(1).forEach((s, i) => {
    const pose = slotPose(T, s);
    c.set(s.who, { x: pose.x, y: pose.y, sx: pose.sx, sy: pose.sy, rot: pose.rot, hidden: pose.hidden, z: 10 + s.row * 5 + i * 0.1 });
    if (pose.hidden) return;
    if (pose.airborne) { c.pose(s.who, FALLING); return; }
    const a = T - s.land;
    switch (s.who) {
      case 'opencode': c.pose(s.who, { look: -0.4, ex: 0, armL: 1.6, armR: 1.6, oscL: 0.28, oscR: 0.28, _f: 6.5, squint: clamp(0.15 + landed * 0.06, 0, 0.5) }); break;
      case 'copilot': { const li = Math.floor(a / 1.1) % 4, pp = (a / 1.1) % 1; c.pose(s.who, { ...SHEET(a), _hold: 'sheet', look: 0.75, ex: -0.8 + 1.6 * pp, _line: li, _prog: pp }); break; }
      case 'cursor': c.pose(s.who, { ...HIP, ikR: 1, hxR: 42, hyR: -76, _hold: 'lens', look: -1, ex: 0.1, squint: 0.1 }); break;
      case 'grok': { const m = clamp((a - 0.2) / 1.6), hw = foldHW(m), jig = (m * 3) % 1 < 0.25 && m < 1 ? 1.5 * Math.sin(a * 30) : 0;
        c.pose(s.who, m < 0.66 ? { ikR: 1, hxR: hw + 3, hyR: -21 - jig, ikL: 1, hxL: -hw - 3, hyL: -21 + jig, look: 0.85, _hold: 'paper', _fold: m } : { ikL: 1, hxL: -38, hyL: -30, ikR: 1, hxR: hw + 3, hyR: -21, look: 0.5, _hold: 'paper', _fold: m }); break; }
      case 'kodek': c.pose(s.who, { ...HIP, ikR: 1, hxR: 34, hyR: -58, _hold: 'net', pole: 0.32, _poleDirect: 1, look: -0.9, ex: -0.5 }); break;
      case 'android': c.pose(s.who, { armL: 0.4, armR: a < 1.6 ? 2.3 : 0.4, oscR: 0.5, _f: 7, happy: 0.3, look: -0.3, ex: 0 }); break;
      case 'kilo': c.pose(s.who, { armL: 2.6, armR: 2.6, oscL: 0.32, oscR: 0.32, _f: 9, happy: 0.9, look: -0.5, hopW: 0.25, _hf: 0.9 }); break;
    }
  });

  // --- the sleeper lands on its pillow and stays asleep ---
  const zp = drop(T, ZCODE.land, ZCODE.x, 0, 0.35);
  c.set('zcode', { x: zp.x, y: zp.y, sx: zp.sx, sy: zp.sy, rot: zp.rot, hidden: zp.hidden, z: 2 });
  // asleep on its pillow (the same parameters as the app's own sleep scene, driven by the timeline so the panda can wake up later)
  c.pose('zcode', { loaf: 1, sleep: 1, dim: 1, th: 0.3, _prop: 'pillow', armL: 0.15, armR: 0.15 });

  // --- the user: notices the noise a little more with every landing ---
  const w = wander(T);
  let dx = 0, rot = 0;
  for (const s of SLOTS) { const ag = T - s.land; if (s.land > 0 && ag >= 0) { dx += 5 * ring(ag, 1, 7, 9); rot += 0.07 * ring(ag, 1, 5, 6); } }
  Object.assign(c.cursor, { x: w.x + dx, y: w.y, press: w.press, rot });

  // --- shake on landings ---
  for (const s of SLOTS) if (s.land > 0) c.punches.push([s.land, 0.9]);
  c.punches.push([ZCODE.land, 0.6]);

  // --- overlays ---
  c.front.push(x => {
    // name tags pop on the beat: on the taskbar for the base row, at the sides higher up
    const h = p ? 68 : 62, at1 = (who: Who) => c.crew[who];
    const tag = (who: Who, t: number, sx: number, sy: number, anchor: 'c' | 'l' | 'r', tilt: number, life = 1.2) =>
      drawTag(x, T, sx, sy, { ...TAGS[who], t, out: t + life, h, tilt, anchor });
    // base row: Clawd and opencode above their heads (nothing stands there yet), Copilot down on the taskbar
    const cl = at1('clawd'), [cx0, cy0] = cl.pt(34, -heightOf('clawd') - 34);
    tag('clawd', CALL + 0.12, cx0, cy0, 'r', -0.03, 0.9);
    const oc = at1('opencode'), [ox, oy] = oc.pt(-14, -heightOf('opencode') - 34);
    tag('opencode', SLOTS[1].land, ox, oy, 'l', 0.03, 0.95);
    const cp = at1('copilot'), [px0, py0] = cp.pt(0, -heightOf('copilot') - 30);
    tag('copilot', SLOTS[2].land, px0, py0, 'c', -0.03, 1.0);
    const cur = at1('cursor'), [cx, cy] = cur.pt(-46, -heightOf('cursor') - 26);
    tag('cursor', SLOTS[3].land, cx, cy, 'r', -0.03);
    const grok = at1('grok'), [gx, gy] = grok.pt(SKINS.grok.width / 2 + 16, -heightOf('grok') * 0.5);
    tag('grok', SLOTS[4].land, gx, gy, 'l', 0.03);
    const kod = at1('kodek'), [kx, ky] = kod.pt(SKINS.kodek.width / 2 + 16, -heightOf('kodek') * 0.85);
    tag('kodek', SLOTS[5].land, kx, ky, 'l', -0.03, 1.2);
    const kil = at1('kilo'), [lx, ly] = kil.pt(0, -heightOf('kilo') - 26);
    tag('kilo', SLOTS[6].land, lx, ly, 'c', 0.03);
    const z = at1('zcode'), [zx, zy] = z.pt(0, -70);
    tag('zcode', ZCODE.land, zx, zy, 'c', 0.03);
    // beside the floater; above it in portrait, where it hovers near the right edge and a tag on that side would be cut off
    const an = at1('android'), [ax, ay2] = an.pt(0, -heightOf('android') - 34);
    tag('android', ANDROID_LAND, ax, ay2, 'c', -0.03);
  });

  void BEAT;
}
