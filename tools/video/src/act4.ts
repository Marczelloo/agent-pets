// Act 4 (bars 7-10): everyone freezes and watches the cursor reach Allow; the click sets off a wave of joy and relief; "Back to work." sends the crew
// home along the taskbar (Clawd stays and starts working); then the seven looks, one pet each.
import { STYLES } from '@app/styles';
import type { StyleId } from '@app/types';
import type { Who } from './actors';
import { at, BEAT } from './beat';
import type { Ctx } from './ctx';
import { CLICK } from './act3';
import { TAGS } from './act2';
import { drawBurst, drawCaption, drawTag, type Burst } from './overlays';
import { DISPERSE, HOME, LEAVE_GAP, LEAVE_ORDER, LEAVE_TIME, SLOTS, ZCODE, heightOf, landing, leaveAt, slotOf, slotPose } from './tower';
import { THEME, STYLE_NAMES } from './themes';
import { clamp, easeIn, easeInOut, easeOut, easeOutBack, hash, lerp, TAU } from './util';
import { worldToScreen } from './camera';

/** The click: the reaction, the confetti and the groove all start here. */
export const PARTY = CLICK;
/** Clawd turns to his terminal once everyone has left. */
export const WORK = DISPERSE + 1.25;
export const FLIP = at(9, 0);
export const LOOKS: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel', 'clean'];
export const WAKE = CLICK + 0.3;
/** Who stars in each look (Sticker and Pixel only exist for Clawd and Kodek); null = the whole crew is back. */
const SOLO: (Who | null)[] = ['clawd', 'opencode', 'copilot', 'kodek', 'cursor', 'grok', 'zcode', null];

/** 1 on the beat, easing back to 0: the pulse everything dances to. */
export const hit = (T: number, from = PARTY) => { const ph = (((T - from) / BEAT) % 1 + 1) % 1; return ph < 0.18 ? easeOut(ph / 0.18) : 1 - easeInOut((ph - 0.18) / 0.82); };
const beatIdx = (T: number) => Math.floor((T - PARTY) / BEAT + 1e-9);


export function act4(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  if (T < CLICK - 0.4) return;

  const ALL: Who[] = ['clawd', 'opencode', 'copilot', 'cursor', 'grok', 'kodek', 'kilo', 'android', 'zcode'];
  const start0 = leaveAt;
  const joy = { happy: 1, armL: 2.7, armR: 2.7, oscL: 0.5, oscR: 0.5, _f: 14, look: -0.2, ex: 0 };

  // ---------- everyone freezes and watches the cursor reach Allow, holding their breath ----------
  if (T < CLICK) {
    for (const w of ALL) { if (w === 'zcode') continue; c.reset(w); c.pose(w, { look: -0.1, ex: -0.7, armL: 0.35, armR: 0.35, happy: 0 }); }
    c.pose('clawd', { bubble: 1, lean: 0.3, ex: -1 });
    c.pose('kodek', { ikR: 1, hxR: 34, hyR: -58, _hold: 'net', pole: 0.32, _poleDirect: 1 });
  }

  // ---------- the click: a wave of joy up the pile, relief for Clawd; then the crew goes home ----------
  if (T >= CLICK && T < FLIP - 0.02) {
    const a = T - CLICK;
    // the wave runs left to right, a frame or two apart
    const order = ALL.filter(w => w !== 'clawd').sort((m, n) => (slotOf(m)?.x ?? ZCODE.x) - (slotOf(n)?.x ?? ZCODE.x));
    for (const w of ALL) {
      if (w === 'clawd') continue;
      const start = leaveAt(w), delay = order.indexOf(w) * 0.027;
      if (T < start) {   // still on the pile: jump with arms up
        c.reset(w); c.pose(w, joy);
        const u = clamp((a - delay) / 0.42);
        if (u > 0 && u < 1) c.set(w, { y: c.crew[w].spec.y - 20 * 4 * u * (1 - u) });
        if (w === 'kodek') c.pose(w, { ikL: 1, hxL: -47, hyL: -25, ikR: 1, hxR: 34 + 6 * Math.sin(a * 9), hyR: -70, _hold: 'net', pole: 0.32 + 0.4 * Math.sin(a * 9), _poleDirect: 1 });
        continue;
      }
      // climbing down and walking home along the taskbar
      const home = HOME[w] ?? 0, from = w === 'zcode' ? { x: ZCODE.x, y: 0 } : slotPose(DISPERSE, slotOf(w)!), u = (T - start) / LEAVE_TIME, dir = home < from.x ? -1 : 1;
      if (u < 1) {
        const e = easeInOut(clamp(u));
        c.set(w, { x: lerp(from.x, home, e), y: lerp(from.y, 0, easeIn(clamp(u))) - 34 * 4 * u * (1 - u), rot: dir * 0.22 * Math.sin(Math.PI * u), sx: 1, sy: 1 });
        c.reset(w); c.pose(w, joy);
      } else {
        const l = landing(T - start - LEAVE_TIME), wave = ['android', 'kilo', 'cursor', 'zcode'].includes(w) && T - start - LEAVE_TIME < 1.0;
        c.set(w, { x: home, y: 0, sx: l.sx, sy: l.sy, rot: 0 });
        c.reset(w); c.pose(w, wave ? { happy: 0.8, armL: 0.3, armR: 2.4, oscR: 0.6, _f: 9, look: -0.2, ex: 0 } : { happy: 0.3, armL: 0.3, armR: 0.3, look: 0, ex: 0 });
      }
    }
    // Clawd: a long breath out, the marker turns into a check, he waves the others off and then turns to his terminal
    if (T < WORK) {
      const exhale = 0.05 * Math.exp(-a / 0.35) + 0.015 * Math.sin(a * 2.6);
      c.set('clawd', { sy: 1 - exhale, sx: 1 + exhale * 0.5 });
      c.reset('clawd');
      c.pose('clawd', T >= DISPERSE + 0.1 ? { bubble: 0, happy: 0.5, armL: 0.3, armR: 2.4, oscR: 0.5, _f: 9, look: -0.1, lean: 0 } : { bubble: 0, happy: 0.5, squint: 0.5, armL: 0.3, armR: 0.3, look: -0.1, lean: -0.15 });
    } else c.set('clawd', { scene: 'bash' });
    c.punches.push([CLICK, 2.6]);
    LEAVE_ORDER.forEach(w => c.punches.push([leaveAt(w) + LEAVE_TIME, 0.4]));
    // the "!" becomes a check mark
    c.front.push(x => {
      const k = clamp((T - (CLICK + 0.08)) / 0.3), fade = 1 - clamp((T - (WORK - 0.2)) / 0.2);
      if (k <= 0 || fade <= 0) return;
      const u = c.crew.clawd.u, [mx, my] = c.crew.clawd.pt(-66, -heightOf('clawd') * 0.55), sc = easeOutBack(k, 1.6) * fade;
      x.save(); x.translate(mx, my); x.scale(sc, sc); x.globalAlpha = fade; x.lineJoin = 'round'; x.lineWidth = Math.max(2, 2.3 * u); x.strokeStyle = '#2B1D16'; x.fillStyle = '#D97757';
      x.beginPath(); x.moveTo(5 * u, 8 * u); x.lineTo(10 * u, 18 * u); x.lineTo(-2 * u, 9 * u); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.roundRect(-12 * u, -13 * u, 24 * u, 24 * u, 7 * u); x.fill(); x.stroke();
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 3.2 * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(-5.5 * u, -1 * u); x.lineTo(-1.5 * u, 3.5 * u); x.lineTo(6 * u, -6.5 * u); x.stroke();
      x.restore();
    });
    // the panda wakes from the commotion
    const wk = clamp((T - WAKE) / 0.6);
    if (T < start0('zcode')) {
      c.reset('zcode');
      const zsleep = { loaf: 1, sleep: 1, dim: 1, th: 0.3, _prop: 'pillow', armL: 0.15, armR: 0.15 };
      if (T < WAKE) c.pose('zcode', zsleep);
      else c.pose('zcode', { loaf: 1 - easeOut(wk), sleep: 1 - easeOut(clamp((T - WAKE) / 0.35)) * 0.85, dim: 1 - wk, th: 0.3 * (1 - wk), _prop: 'pillow', armL: 0.15 + 2.2 * wk, armR: 0.15 + 2.2 * wk, look: 0.3 });
      if (T >= WAKE && T < WAKE + 1 / 60 + 1e-6) c.emit('zcode', { t: '?', x: 12, y: -74, vx: 6, vy: -22, life: 0, max: 1.1, s: 24, col: 'clay' });
    }
  }
  void LEAVE_GAP;

  // ---------- the party (until the group photo) ----------
  if (T >= FLIP - 0.02 && T < at(11, 0) - 0.02) {
    const a = T - PARTY, h = hit(T), k = beatIdx(T), s = Math.sin((T - PARTY) * TAU * (1 / (2 * BEAT)));
    const phones = { _phones: 1, _notes: 0.2, happy: 0.55 };
    // the whole pyramid bounces on the beat
    const bounce = -7 * h * clamp(a / 0.15);
    for (const slot of SLOTS) c.set(slot.who, { y: c.crew[slot.who].spec.y + bounce });
    c.reset('clawd'); c.pose('clawd', { ...phones, bubble: 0, armL: 2.5 + 0.4 * s, armR: 2.5 - 0.4 * s, look: -0.2, ex: 0, lean: 0.05 * h });
    c.reset('opencode'); c.pose('opencode', { ...phones, tilt: 0.14 * h - 0.04, lean: 0.35 * h, squint: 1, armL: 2.7, armR: 2.7, happy: 0 });
    c.reset('copilot'); c.pose('copilot', { ...phones, ikL: 1, hxL: -34, hyL: -46, ikR: 1, hxR: 12, hyR: -30 + 6 * h, tilt: -0.05 + 0.05 * h, th: 0.25, lean: 0.2 * h, squint: 0.6, happy: 0 });
    c.reset('cursor'); c.pose('cursor', { ...phones, ikL: 1, hxL: -44, hyL: -62, ikR: 1, hxR: 30 + 9 * Math.sin(T * TAU * 1.8), hyR: -26, th: 0.3, look: 0.4, tilt: 0.04 * Math.sin(T * Math.PI * 1.8) });
    const sg = k % 2 ? -1 : 1;
    c.reset('grok'); c.pose('grok', { ...phones, ikL: 1, ikR: 1, hxR: sg > 0 ? 42 : 38, hyR: sg > 0 ? -96 : -30, hxL: sg < 0 ? -42 : -38, hyL: sg < 0 ? -96 : -30, lx: 4 * sg, tilt: -0.08 * sg, th: 0.2 * sg, look: -0.6, ex: 0.8 * sg });
    c.reset('kodek'); c.pose('kodek', { ...phones, ikL: 1, hxL: -47, hyL: -25, ikR: 1, hxR: 34 + 8 * s, hyR: -70, _hold: 'net', pole: 0.32 + 0.55 * s, _poleDirect: 1 });
    c.reset('kilo'); c.pose('kilo', { ...phones, armL: 2.8, armR: 2.8, oscL: 0.4, oscR: 0.4, _f: 11, hopW: 0.5, _hf: 1 / BEAT });
    c.reset('android'); c.pose('android', { ...phones, armL: 2.3 + 0.5 * s, armR: 2.3 - 0.5 * s, tilt: 0.05 * s });
    // the panda slept through all of it: the confetti wakes it
    const w = clamp((T - WAKE) / 0.6), yawn = clamp((T - (WAKE + 0.5)) / 0.5);
    c.reset('zcode');
    const zsleep = { loaf: 1, sleep: 1, dim: 1, th: 0.3, _prop: 'pillow', armL: 0.15, armR: 0.15 };
    if (T < WAKE) c.pose('zcode', zsleep);
    else if (w < 1) c.pose('zcode', { loaf: 1 - easeOut(w), sleep: 1 - easeOut(clamp((T - WAKE) / 0.35)) * 0.85, dim: 1 - w, th: 0.3 * (1 - w), _prop: 'pillow', armL: 0.15 + 2.2 * w, armR: 0.15 + 2.2 * w, look: 0.3 });
    else c.pose('zcode', { ...phones, armL: 2.3 - 0.5 * s, armR: 2.3 + 0.5 * s, sleep: yawn < 1 ? 0.6 * (1 - yawn) : 0, hopW: 0.6, _hf: 1 / BEAT, th: 0.1 * s });
    if (T >= WAKE && T < WAKE + 1 / 60 + 1e-6) c.emit('zcode', { t: '?', x: 12, y: -74, vx: 6, vy: -22, life: 0, max: 1.1, s: 24, col: 'clay' });
    c.set('zcode', { y: c.crew.zcode.spec.y + bounce * 0.4 });
    // sparkles on the downbeat
    // headphones and the equaliser lines under the base row
    for (const [who, wx] of [['clawd', 0], ['opencode', 98], ['copilot', 196]] as [Who, number][]) c.bars.push({ x: wx, session: { agent: who === 'clawd' ? 'claude' : 'codex', state: 'idle', progress: null }, music: 'dance' });
    c.punches.push([PARTY, 2.4]);
    for (let i = 1; i < 16; i++) c.punches.push([PARTY + i * BEAT, i % 4 === 0 ? 0.7 : 0.35]);
  }

  // ---------- confetti ----------
  const bursts: Burst[] = [];
  const W = fmt.W, H = fmt.H, spd = p ? 1500 : 1750;
  bursts.push({ t: PARTY, x: W * 0.06, y: H * 0.95, n: 34, speed: spd, dir: -1.05, spread: 0.75, seed: 3, size: p ? 1.3 : 1.5, life: 3.0 });
  bursts.push({ t: PARTY, x: W * 0.94, y: H * 0.95, n: 34, speed: spd, dir: -Math.PI + 1.05, spread: 0.75, seed: 8, size: p ? 1.3 : 1.5, life: 3.0 });
  c.top.push(x => { for (const b of bursts) drawBurst(x, T, b, fmt); });
  void STYLES; void hash; void lerp; void worldToScreen; void heightOf; void ZCODE;

  // ---------- captions ----------
  const size = p ? 92 : 72, cy = p ? 230 : 78;
  c.front.push(x => {
    const t0 = CLICK, tb = DISPERSE, out = DISPERSE + 2.0, ink = c.theme.text;
    const words = p
      ? [[{ text: 'Allow.', t: t0, out, color: ink }], [{ text: 'Back', t: tb, out, color: ink }, { text: 'to', t: tb + 0.1, out, color: ink }, { text: 'work.', t: tb + 0.2, out, color: '#D97757' }]]
      : [[{ text: 'Allow.', t: t0, out, color: ink }, { text: 'Back', t: tb, out, color: ink }, { text: 'to', t: tb + 0.1, out, color: ink }, { text: 'work.', t: tb + 0.2, out, color: '#D97757' }]];
    drawCaption(x, T, words, { size: p ? size * 1.1 : size, cx: p ? fmt.W / 2 : fmt.W * 0.4, cy: p ? cy + 50 : cy, lineGap: 1.05 });
  });
  // the user has done their bit: the pointer slips away
  if (T >= PARTY) c.cursor.alpha = 1 - clamp((T - (PARTY + 0.1)) / 0.5);

  // ---------- the seven looks ----------
  if (T >= FLIP - 0.02) {
    const i = clamp(Math.floor((T - FLIP) / BEAT + 1e-6), 0, LOOKS.length - 1), style = LOOKS[i], th = THEME[style], prev = THEME[LOOKS[Math.max(0, i - 1)]];
    c.theme = th;
    const since = (T - FLIP) - i * BEAT, dir = i % 2 ? -1 : 1;
    const pyC = worldToScreen({ x: 0, y: 0, z: 1 }, fmt, 0, 0); void pyC;
    c.wipe = i > 0 || LOOKS[0] !== 'clean' ? { prev: i === 0 ? THEME.clean : prev, k: clamp(since / 0.2), cx: fmt.W * (dir > 0 ? 0.85 : 0.15), cy: fmt.H * 0.62 } : undefined;
    for (const w of ALL) c.set(w, { look: { style, motion: 'calm' } });
    // one pet per look, cut in from alternating sides with a squash; Sticker and Pixel exist for Clawd and Kodek only. The last beat brings the crew back.
    const solo = SOLO[i], enter = clamp(since / 0.3), lz = landing(since - 0.22);
    if (solo) {
      // the first look grows out of Clawd where he stands; the others fade out beside him or are simply gone
      const e0 = easeInOut(clamp(since / 0.3));
      for (const w of ALL) if (w !== solo) c.set(w, i === 0 ? { alpha: 1 - e0, x: HOME[w] ?? 0, y: 0 } : { hidden: true });
      if (i === 0) c.set(solo, { x: lerp(0, 98, e0), y: -7 * hit(T) * e0, s: lerp(1, 1.9, e0), z: 60, sx: 1, sy: 1, rot: 0 });
      else c.set(solo, { x: 98 + dir * (1 - easeOutBack(enter, 1.3)) * 560, y: -7 * hit(T), s: 1.9, z: 60, sx: lz.sx, sy: lz.sy, rot: dir * (1 - easeOut(enter)) * 0.4 });
      c.front.push(x => { const [tx, ty] = c.crew[solo].pt(0, -heightOf(solo) - 44); drawTag(x, T, tx, ty, { ...TAGS[solo], t: FLIP + i * BEAT + 0.12, out: FLIP + (i + 1) * BEAT - 0.04, h: p ? 68 : 62, tilt: -0.03 * dir, anchor: 'c' }); });
    }
    // a pulse on every change
    for (let j = 0; j < LOOKS.length; j++) c.punches.push([FLIP + j * BEAT, 1.6]);
    c.front.push(x => {
      const name = STYLE_NAMES[style], t0 = FLIP + i * BEAT, outAt = t0 + BEAT;
      const ink = th.text, sub = th.sub;
      drawCaption(x, T, [[{ text: 'Seven', t: FLIP - 0.02, color: sub, k: 0.5, out: at(11, 0) }, { text: 'looks.', t: FLIP + 0.02, color: sub, k: 0.5, out: at(11, 0) }]], { size: size * 0.8, cx: fmt.W / 2, cy: cy - (p ? 60 : 42), lineGap: 1.1 });
      drawCaption(x, T, [[{ text: name, t: t0, out: outAt - 0.05, color: ink }]], { size: size * 1.1, cx: fmt.W / 2, cy: cy + (p ? 70 : 30), lineGap: 1.1, weight: 700 });

    });
  }
}
