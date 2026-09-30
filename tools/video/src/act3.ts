// Act 3 (bars 5-7): getting the user's attention. Kilo waves, Kodek swings the net and misses, Grok's paper plane bonks the cursor
// dizzy, the second swing scoops it up, and it hops down the crew to Clawd's question.
import { SKINS } from '@app/skins';
import { fxState, impact, spray, word } from '@app/renderer/dynamic/state';
import { at } from './beat';
import type { Ctx } from './ctx';
import { wander } from './cursor';
import { drawBubble, drawBurst, drawCaption, drawDizzy, drawNetOverlay, drawPlane, drawRipple, drawSpark } from './overlays';
import { heightOf, slotOf, slotPose, SLOTS } from './tower';
import { clamp, easeIn, easeInOut, easeOut, easeOutBack, hash, lerp, remap, ring, TAU } from './util';
import { PAL } from './world';
import { fit, still, worldToScreen, type CamFn } from './camera';
import type { Format } from './format';
import { partyCam, rainCam } from './act2';
import type { Actor, Who } from './actors';

/* ---- the plan, in seconds ---- */
export const HI = at(5, 2);              // Kilo waves hello
export const SWING1 = at(5, 3) + 0.22;   // net reaches the cursor... which is no longer there
export const PLANE_THROW = at(6, 0) - 0.15;
export const PLANE_HIT = PLANE_THROW + 0.46;
export const CATCH = at(6, 1);           // the net scoops it up
export const HOP1 = at(6, 2);            // out of the net onto Cursor's head
export const HOP2 = at(6, 3);            // onto the question
export const CLICK = at(7, 0);           // on the downbeat: the party starts

export const HOP_TIME = 0.34;
const HIT_SPIN = 1.5;

/** Where the cursor was (and would have gone on to be) at the moment of each event. */
const at1 = () => wander(SWING1 - 0.3);

/** Smooth 0..1 progress of an event that starts at t0 and lasts d. */
const prog = (T: number, t0: number, d: number) => clamp((T - t0) / d);

/** Cursor position (world pu) before it is caught: browsing, twitching, dodging, then spun out by the plane. */
export function freeCursor(T: number): { x: number; y: number; rot: number; press: number; dizzy: number } {
  const w = wander(Math.min(T, PLANE_HIT));
  let x = w.x, y = w.y, rot = 0, dizzy = 0;
  // a hello from Kilo: it half notices
  rot += 0.18 * Math.sin(prog(T, HI + 0.15, 0.5) * Math.PI);
  // dodge: the net comes, the cursor hops out of the way and drifts back
  const dq = T - (SWING1 - 0.12);
  if (dq >= 0 && dq < 1.1) {
    const k = dq < 0.2 ? easeOutBack(dq / 0.2, 2) : 1 - easeInOut(clamp((dq - 0.45) / 0.65));
    x += 62 * k; y += -34 * k; rot += 0.35 * k;
  }
  if (T >= PLANE_HIT) {
    const a = T - PLANE_HIT;
    // knocked into a spin that decays, drifting toward where the second swing will land
    x += 10 * (1 - Math.exp(-a * 5)); y += 8 * (1 - Math.exp(-a * 5));
    rot += TAU * HIT_SPIN * (1 - Math.exp(-a * 3.2)); dizzy = clamp(1 - Math.max(0, a - 0.3) / 0.4);
  }
  return { x, y, rot, press: 0, dizzy };
}

/** Where the second swing meets the cursor. */
export const catchPoint = () => { const p = freeCursor(CATCH - 0.02); return { x: p.x, y: p.y }; };

/** Aim of Kodek's net: local hand target and pole angle so the hoop (73 pu along the pole) lands on a world point. */
function aim(kodek: Actor, target: { x: number; y: number }) {
  const s = kodek.spec, fx = s.x, fy = s.y;
  const S = { x: 30, y: -52 }, lx = (target.x - fx) / s.sx, ly = (target.y - fy) / s.sy;
  const dx = lx - S.x, dy = ly - S.y, dist = Math.hypot(dx, dy) || 1, d = { x: dx / dist, y: dy / dist };
  const hd = clamp(dist - 73, 14, 60);
  return { hx: S.x + d.x * hd, hy: S.y + d.y * hd, pole: Math.atan2(d.x, -d.y) };
}

const REST = { hx: 34, hy: -58, pole: 0.32 };

/** One swing: wind back, whip forward to `target`, follow through, settle. `contact` is when the hoop is on target. */
function swing(T: number, contact: number, tgt: { hx: number; hy: number; pole: number }, recover: number) {
  const wind = contact - 0.44, fwd = contact - 0.2;
  if (T < wind) return null;
  if (T < fwd) { const k = easeOut(remap(T, wind, fwd)); return { hx: lerp(REST.hx, 8, k), hy: lerp(REST.hy, -66, k), pole: lerp(REST.pole, -1.0, k) }; }
  const k = easeIn(remap(T, fwd, contact - 0.02));
  const a = { hx: lerp(8, tgt.hx, k), hy: lerp(-66, tgt.hy, k), pole: lerp(-1.0, tgt.pole, k) };
  if (T < contact + recover) return a;
  return null;
}

export function act3(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  if (T < HI - 0.6) return;
  const crew = c.crew, kodek = crew.kodek, kilo = crew.kilo, grok = crew.grok, clawd = crew.clawd, cursorPet = crew.cursor;
  const kSlot = slotOf('kodek')!, gSlot = slotOf('grok')!;
  void kSlot; void gSlot; void SLOTS; void slotPose; void heightOf; void SKINS;

  // ---------- the user ----------
  const free = freeCursor(T);
  const inNet = T >= CATCH && T < HOP1;
  const hopping1 = T >= HOP1 && T < HOP1 + HOP_TIME, onHead = T >= HOP1 + HOP_TIME && T < HOP2, hopping2 = T >= HOP2 && T < HOP2 + HOP_TIME, onBubble = T >= HOP2 + HOP_TIME;
  Object.assign(c.cursor, { x: free.x, y: free.y, rot: free.rot, press: 0 });

  // Where the question comes back: to the left of Clawd, tail toward him.
  const bubbleAge = T - (HOP2 - 0.25);
  const bubbleTail = () => clawd.pt(-50, -40);
  const bubbleTop = (): [number, number] => { const [bx, by] = bubbleTail(); return [bx - (p ? 110 : 150) * (clawd.u / 2.0), by - 26 * (clawd.u / 2.0)]; };

  // ---------- who looks at what: everyone watches the cursor ----------
  const cw = () => ({ x: c.cursor.x, y: c.cursor.y });
  const watchers: [Who, number][] = [['kilo', -0], ['kodek', 0], ['grok', 0], ['cursor', 0], ['opencode', 0], ['clawd', 0], ['android', 0]];
  for (const [w] of watchers) {
    const a = crew[w];
    if (a.spec.hidden) continue;
    const t = cw(), dx = clamp((t.x - a.spec.x) / 130, -1, 1), dy = clamp((t.y - (a.spec.y - 60)) / 150, -1, 1);
    if (w !== 'clawd') c.pose(w, { ex: dx, look: T < CLICK ? clamp(dy, -1, 0.3) : a.spec.drive.look });
  }

  // ---------- Kilo: hello! ----------
  const hi = T - HI;
  if (hi > 0 && hi < 1.1) {
    c.pose('kilo', { armL: 2.8, armR: 2.8, oscL: 0.55, oscR: 0.55, _f: 13, hopW: 0.9, _hf: 1.8, happy: 1, look: -0.6 });
  }
  c.front.push((x, cam) => {
    if (hi < 0 || hi > 1.15) return;
    const [ax, ay] = kilo.pt(6, -heightOf('kilo') - 16);
    drawBubble(x, { text: 'hi!', ax, ay, side: 'below', size: clamp(cam.z * 9, 30, 64), age: hi, gone: hi > 0.95 ? hi - 0.95 : undefined, kind: 'action' });
  });

  // ---------- Kodek: two swings ----------
  const swing1Tgt = aim(kodek, at1()), swing2Tgt = aim(kodek, catchPoint());
  const s1 = swing(T, SWING1, swing1Tgt, 0.5), s2 = swing(T, CATCH, swing2Tgt, 0.0);
  let net: { hx: number; hy: number; pole: number } | null = s2 ?? s1;
  const dynamic = T >= CATCH - 0.08 && T < CATCH + 1.3;
  const dodging = T > SWING1 + 0.5 && T < CATCH - 0.44;
  if (dodging) net = null;
  if (T >= CATCH && T < HOP1) {
    // holds it up, the net sagging a little as the cursor thrashes about inside
    const k = remap(T, CATCH, CATCH + 0.25), thrash = Math.sin((T - CATCH) * 34) * 0.05 * (1 - k);
    net = { hx: swing2Tgt.hx, hy: swing2Tgt.hy + 6 * Math.sin(k * Math.PI), pole: swing2Tgt.pole + thrash };
  } else if (T >= HOP1 && T < HOP1 + 0.9) {
    const k = easeInOut(remap(T, HOP1, HOP1 + 0.9));
    net = { hx: lerp(swing2Tgt.hx, REST.hx, k), hy: lerp(swing2Tgt.hy, REST.hy, k), pole: lerp(swing2Tgt.pole, REST.pole, k) };
  }
  if (T >= HOP1 + 0.9 && !dynamic) net = null;
  if (net) c.pose('kodek', { ...{ ikR: 1, hxR: net.hx, hyR: net.hy, _hold: 'net', pole: net.pole, _poleDirect: 1 } });
  else c.pose('kodek', { ikR: 1, hxR: REST.hx, hyR: REST.hy, _hold: 'net', pole: REST.pole, _poleDirect: 1 });
  if (T >= HI - 0.6) c.pose('kodek', { ikL: 1, hxL: -47, hyL: -25, happy: T >= CATCH ? 0.9 : 0, squint: 0 });
  // anime look for the catch: snappy springs, an impact frame, sparks
  c.set('kodek', { look: { style: 'clean', motion: dynamic ? 'dynamic' : 'calm' } });
  if (T >= CATCH && T < CATCH + 1 / 60 + 1e-6) {
    const pet = kodek.pet as never;
    void fxState(pet);
    impact(pet, 3.2); spray(pet, 'spark', 14, 60, -110, 130, -Math.PI / 2, TAU); word(pet, '!', 70, -128, 40);
  }

  // ---------- Grok: winds up and throws the plane ----------
  const gt = T - PLANE_THROW;
  if (gt > -0.5) {
    const wind = clamp((gt + 0.5) / 0.4), thr = clamp(gt / 0.1);
    if (gt < 0) c.pose('grok', { ikL: 1, hxL: -38, hyL: -30, ikR: 1, hxR: lerp(25, 36, wind), hyR: lerp(-21, -92, easeOut(wind)), th: -0.05, look: -0.4, _hold: 'paper', _fold: 1 });
    else c.pose('grok', { ikL: 1, hxL: -38, hyL: -30, ikR: 1, hxR: lerp(36, 62, thr), hyR: lerp(-92, -52, thr), th: 0.05, look: -0.5, _hold: gt < 0.05 ? 'paper' : null, _fold: 1, tilt: 0.06 });
  }
  c.front.push((x, cam) => {
    if (gt < 0 || gt > 0.6) return;
    const k = clamp(gt / (PLANE_HIT - PLANE_THROW));
    const [x0, y0] = grok.pt(62, -52), tgt = freeCursor(PLANE_HIT), [x1, y1] = worldToScreen(cam, fmt, tgt.x, tgt.y);
    const bend = -70 * cam.z * Math.sin(k * Math.PI), px = lerp(x0, x1, easeIn(k) * 0.4 + k * 0.6), py = lerp(y0, y1, k) + bend;
    const dx = x1 - x0, dy = y1 - y0 + bend * 0.2, rot = Math.atan2(dy, dx) + Math.sin(k * 9) * 0.15;
    drawPlane(x, px, py, rot, 26 * cam.z * 0.9 + 12);
    if (k < 1) { x.save(); x.globalAlpha = 0.5 * (1 - k); x.setLineDash([2, 12]); x.strokeStyle = '#C9B8A8'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(x0, y0); x.quadraticCurveTo((x0 + px) / 2, Math.min(y0, py) - 20, px, py); x.stroke(); x.restore(); }
  });
  // bonk
  c.front.push((x, cam) => {
    const a = T - PLANE_HIT;
    if (a < 0 || a > 0.9) return;
    const [sx, sy] = worldToScreen(cam, fmt, free.x, free.y);
    drawRipple(x, T, PLANE_HIT, sx + 6 * cam.z, sy + 6 * cam.z, 90 * cam.z * 0.6 + 30, 0.5);
    drawSpark(x, sx + 20 * cam.z, sy - 4 * cam.z, 12 * cam.z * 0.5 + 8, '#EF9F27', a * 5);
    if (free.dizzy > 0) { x.save(); x.globalAlpha = free.dizzy; drawDizzy(x, T, sx + 4 * cam.z, sy - 2 * cam.z, 26 * cam.z * 0.5 + 10); x.restore(); }
  });

  // ---------- the catch ----------
  c.front.push(x => { if (inNet) drawNetOverlay(x, kodek, 0.75); });

  // hop out of the net onto Cursor's head, then across to the question
  const hopFrom = (): [number, number] => { const [sx, sy] = kodek.pt(kodek.pet.hoop?.[0] ?? 40, kodek.pet.hoop?.[1] ?? -110); return [sx, sy]; };
  const head = (): [number, number] => cursorPet.pt(-8, -heightOf('cursor') - 4);
  const hopArc = (a: [number, number], b: [number, number], k: number, h: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k) - h * Math.sin(k * Math.PI)];
  let hopFromCache: [number, number] | null = null;
  c.cursor.late = cam => {
    if (inNet) {
      const hp = kodek.pet.hoop as [number, number] | undefined, ph = kodek.pet.p.pole.x as number;
      if (!hp) return null;
      const [sx, sy] = kodek.pt(hp[0] + 8 * Math.cos(ph), hp[1] + 8 * Math.sin(ph));
      const a = T - CATCH;
      hopFromCache = [sx, sy];
      return { screen: [sx + Math.sin(a * 30) * 4, sy + Math.cos(a * 26) * 3], rot: 0.5 + Math.sin(a * 22) * 0.3, size: 34, press: 0 };
    }
    if (hopping1) { const k = prog(T, HOP1, HOP_TIME), a = hopFromCache ?? hopFrom(); const [sx, sy] = hopArc(a, head(), easeInOut(k), 60 * cam.z * 0.5); return { screen: [sx, sy], rot: lerp(0.5, 0, k) + TAU * k, size: 34 }; }
    if (onHead) { const a = T - (HOP1 + HOP_TIME), sq = ring(a, 0.16, 4, 8); const [sx, sy] = head(); return { screen: [sx, sy], rot: 0, size: 34 * (1 - sq * 0.5), press: sq }; }
    if (hopping2) { const k = prog(T, HOP2, HOP_TIME), [bx, by] = bubbleTop(); const [sx, sy] = hopArc(head(), [bx + 40 * cam.z * 0.5, by - 4], easeInOut(k), 70 * cam.z * 0.5); return { screen: [sx, sy], rot: TAU * k, size: 34 }; }
    if (onBubble) {
      const [bx, by] = bubbleTop(), a = T - (HOP2 + HOP_TIME), press = T >= CLICK - 0.12 ? 1 : 0;
      return { screen: [bx + 40 * cam.z * 0.5, by - 4 + Math.sin(a * 9) * 2], rot: 0, size: 34, press };
    }
    return null;
  };

  // the Antigravity robot, on the top corner of the stack, cheers when the net comes up full and flinches at the plane
  if (T >= PLANE_HIT && T < PLANE_HIT + 0.5) c.pose('android', { armL: 1.2, armR: 1.2, squint: 0.6 });
  if (T >= CATCH && T < HOP2) c.pose('android', { armL: 2.6, armR: 2.6, oscL: 0.3, oscR: 0.3, _f: 10, happy: 0.9 });

  // Cursor (the pet) gets a mouse cursor on its head and a look of surprise
  if (T >= HOP1 + HOP_TIME - 0.05 && T < HOP2) { c.pose('cursor', { ...{ ikL: 1, hxL: -47, hyL: -25 }, ikR: 1, hxR: 42, hyR: -76, _hold: 'lens', look: -1, ex: 0, squint: 0, bubble: 1 }); }

  // ---------- the question comes back, big, and gets clicked ----------
  c.front.push((x, cam) => {
    if (bubbleAge < 0) return;
    const [ax, ay] = bubbleTail();
    const lines = p ? ['Allow Bash?', 'npm test'] : 'Allow Bash? npm test';
    const gone = T >= CLICK ? T - CLICK : undefined;
    const size = clamp(cam.z * (p ? 12.5 : 13), 30, 80);
    drawBubble(x, { text: lines, ax, ay, side: 'right', size, age: bubbleAge, gone });
    if (T >= CLICK) {
      const bx = ax - (p ? 150 : 250) * (cam.z / 3.3), by = ay - size * 0.1;
      drawRipple(x, T, CLICK, bx, by, 260, 0.6);
      drawBurst(x, T, { t: CLICK, x: bx, y: by, n: 46, speed: 650, dir: -Math.PI / 2, spread: Math.PI * 2, gravity: 1500, seed: 5, size: 1.7, life: 1.6 }, fmt);
    }
  });

  // ---------- big moments ----------
  c.punches.push([HI, 0.3], [SWING1, 0.7], [PLANE_HIT, 0.8], [CATCH, 2.2], [HOP1 + HOP_TIME, 0.7], [HOP2 + HOP_TIME, 0.7], [CLICK, 1.6]);
  c.top.push(x => {
    // the catch: a warm flash and rays out of the net
    const a = T - CATCH;
    if (a >= 0 && a < 0.5) {
      const k = a / 0.5;
      x.save(); x.globalAlpha = (1 - easeOut(clamp(a / 0.22))) * 0.7; x.fillStyle = '#FFF4E0'; x.fillRect(0, 0, fmt.W, fmt.H); x.restore();
      const hp = kodek.pet.hoop as [number, number] | undefined;
      if (hp) {
        const [sx, sy] = kodek.pt(hp[0], hp[1]);
        x.save(); x.globalAlpha = 1 - k; x.strokeStyle = PAL.ink; x.lineCap = 'round';
        for (let i = 0; i < 16; i++) { const ang = (i / 16) * TAU + hash(i) * 0.2, r0 = (60 + 300 * easeOut(k)) * (fmt.portrait ? 0.8 : 1), r1 = r0 + 70 + hash(i * 3) * 80; x.lineWidth = 9 * (1 - k) + 2; x.beginPath(); x.moveTo(sx + Math.cos(ang) * r0, sy + Math.sin(ang) * r0); x.lineTo(sx + Math.cos(ang) * r1, sy + Math.sin(ang) * r1); x.stroke(); }
        x.restore();
      }
    }
  });

  // ---------- captions ----------
  c.front.push(x => {
    const y = p ? 190 : 72, size = p ? 88 : 68;
    drawCaption(x, T, [[{ text: 'Got', t: CATCH + 0.12, out: CLICK - 0.1 }, { text: 'your', t: CATCH + 0.22, out: CLICK - 0.1 }, { text: 'attention?', t: CATCH + 0.34, color: PAL.clay, out: CLICK - 0.1 }]],
      { size: size * 1.06, cx: fmt.W / 2, cy: y, lineGap: 1.1 });
    // "So the crew stepped in." makes way for it (act 2 gives it an exit)
    void easeIn;
  });
  void hopping1;
}


/** Camera moves for the catch: in on Kodek's net, down to Clawd's question for the click, out again for the party. */
export function act3Cam(fmt: Format): [number, CamFn, ((t: number) => number)?][] {
  const p = fmt.portrait;
  const top = fit({ x0: 10, x1: 300, y0: -430, y1: -120 }, fmt, { top: p ? 300 : 20, bottom: p ? 300 : 20 });
  const low = p ? fit({ x0: -225, x1: 60, y0: -200, y1: 60 }, fmt, { top: 300, bottom: 300 }) : fit({ x0: -250, x1: 40, y0: -150, y1: 60 }, fmt, { top: 20, bottom: 20 });
  return [
    [HI - 0.2, rainCam(fmt), easeInOut], [CATCH - 0.12, still(top), easeInOut], [HOP1 + 0.1, still(top)],
    [HOP2 + 0.3, still(low), easeInOut], [PARTY_AT - 0.02, still(low)], [PARTY_AT + 0.55, partyCam(fmt), t => easeOutBack(t, 1.25)],
  ];
}
const PARTY_AT = at(7, 1);
