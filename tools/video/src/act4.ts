// Act 4 (bars 7-10): the click, a beat of silence, then the party (headphones on, the whole pyramid bopping) and the seven looks.
import { STYLES } from '@app/styles';
import type { StyleId } from '@app/types';
import type { Who } from './actors';
import { at, BEAT } from './beat';
import type { Ctx } from './ctx';
import { CLICK } from './act3';
import { TAGS } from './act2';
import { drawBurst, drawCaption, drawTag, type Burst } from './overlays';
import { SLOTS, ZCODE, heightOf, landing } from './tower';
import { THEME, STYLE_NAMES } from './themes';
import { clamp, easeInOut, easeOut, easeOutBack, hash, lerp, TAU } from './util';
import { worldToScreen } from './camera';

export const PARTY = at(7, 1);
export const FLIP = at(9, 0);
export const LOOKS: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel', 'clean'];
export const WAKE = PARTY + 0.45;
/** Who stars in each look (Sticker and Pixel only exist for Clawd and Kodek); null = the whole crew is back. */
const SOLO: (Who | null)[] = ['clawd', 'opencode', 'copilot', 'kodek', 'cursor', 'grok', 'zcode', null];

/** 1 on the beat, easing back to 0: the pulse everything dances to. */
export const hit = (T: number, from = PARTY) => { const ph = (((T - from) / BEAT) % 1 + 1) % 1; return ph < 0.18 ? easeOut(ph / 0.18) : 1 - easeInOut((ph - 0.18) / 0.82); };
const beatIdx = (T: number) => Math.floor((T - PARTY) / BEAT + 1e-9);


export function act4(c: Ctx): void {
  const { T, fmt } = c, p = fmt.portrait;
  if (T < CLICK - 0.4) return;

  // ---------- a beat of held breath after the click ----------
  if (T >= CLICK && T < PARTY) {
    for (const s of SLOTS) { if (s.who === 'kodek') continue; }
    for (const w of ['kilo', 'kodek', 'grok', 'cursor', 'opencode', 'copilot', 'android'] as Who[]) { c.reset(w); c.pose(w, { look: -0.1, ex: -0.7, armL: 0.35, armR: 0.35 }); }
    c.reset('clawd'); c.pose('clawd', { look: 0, ex: -1, bubble: 0, armL: 0.35, armR: 0.35, lean: 0.3 });
    c.pose('kodek', { ikR: 1, hxR: 34, hyR: -58, _hold: 'net', pole: 0.32, _poleDirect: 1 });
  }

  // ---------- the party (until the group photo) ----------
  if (T >= PARTY && T < at(11, 0) - 0.02) {
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
    const t0 = PARTY + 0.15, out = PARTY + 2.7, ink = c.theme.text;
    const words = p
      ? [[{ text: 'Allow.', t: t0, out, color: ink }], [{ text: 'Back', t: t0 + 0.3, out, color: ink }, { text: 'to', t: t0 + 0.4, out, color: ink }, { text: 'work.', t: t0 + 0.5, out, color: '#D97757' }]]
      : [[{ text: 'Allow.', t: t0, out, color: ink }, { text: 'Back', t: t0 + 0.3, out, color: ink }, { text: 'to', t: t0 + 0.4, out, color: ink }, { text: 'work.', t: t0 + 0.5, out, color: '#D97757' }]];
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
    const ALL: Who[] = ['clawd', 'opencode', 'copilot', 'cursor', 'grok', 'kodek', 'kilo', 'android', 'zcode'];
    for (const w of ALL) c.set(w, { look: { style, motion: 'calm' } });
    // one pet per look, cut in from alternating sides with a squash; Sticker and Pixel exist for Clawd and Kodek only. The last beat brings the crew back.
    const solo = SOLO[i], enter = clamp(since / 0.3), lz = landing(since - 0.22);
    if (solo) {
      for (const w of ALL) if (w !== solo) c.set(w, { hidden: true });
      c.set(solo, { x: 98 + dir * (1 - easeOutBack(enter, 1.3)) * 560, y: -7 * hit(T), s: 1.9, z: 60, sx: lz.sx, sy: lz.sy, rot: dir * (1 - easeOut(enter)) * 0.4 });
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
