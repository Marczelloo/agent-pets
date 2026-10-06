// The showcase: a calm intro on the taskbar, then a beat-cut tour of the app (what the pets show, "needs you", the panel and limits,
// the seven looks, stats, the Claude Code mod, the crew) and the banner as the end card. A pure function of time, rendered in order.
import type { Limit, StyleId } from '@app/types';
import { blank, CREW, makeCrew, type Actor, type Who } from '../actors';
import { fit, mixCam, worldToScreen, type Cam } from '../camera';
import type { Format } from '../format';
import { drawBubble, drawBurst, drawCaption, drawTag, setInk, type Burst, type Tok } from '../overlays';
import { CREAM, type Theme } from '../themes';
import { clamp, easeIn, easeInOut, easeOut, easeOutBack, hash, lerp, TAU } from '../util';
import { drawBackdrop, drawCursor, drawTaskbar, FONT, PAL, UI_FONT } from '../world';
import { BEAT, DURATION, HIT, NOTICE, T_END, T_MOD, T_NEEDS, T_PANEL, T_STATES, T_STATS, T_STYLES, TOUR, bar } from './time';
import { drawWindow, frame, frameAt, loadMeta, need, type Seq } from './ui';

export { DURATION };

/** The crew on the taskbar, left to right, like the banner. */
const ROW: Who[] = ['copilot', 'opencode', 'kodek', 'clawd', 'android', 'grok', 'cursor', 'zcode'];
const rowX = (w: Who) => -367 + ROW.indexOf(w) * 105;

const NAMES: Record<Who, { name: string; agent: string; color: string }> = {
  clawd: { name: 'Clawd', agent: 'Claude Code', color: '#D97757' },
  kodek: { name: 'Kodek', agent: 'Codex', color: '#5DCAA5' },
  opencode: { name: 'opencode', agent: 'opencode', color: '#3A3535' },
  copilot: { name: 'Copilot', agent: 'GitHub', color: '#5BA8E6' },
  android: { name: 'Antigravity', agent: 'Google', color: '#3DDC84' },
  cursor: { name: 'Cursor', agent: 'Cursor', color: '#2A2A2A' },
  grok: { name: 'Grok', agent: 'Grok Build', color: '#8A8A96' },
  zcode: { name: 'ZCode', agent: 'Z.ai', color: '#2F6BFF' },
  kilo: { name: '', agent: '', color: '#000' },
};

/** What the crew is up to while it is calm (the app's own scenes). */
const CALM: Partial<Record<Who, string>> = { copilot: 'read', opencode: 'thinking', kodek: 'vibe', clawd: 'edit', android: 'vibe', grok: 'idle', cursor: 'grep', zcode: 'sleep' };

/** One pet per beat, each in a different state: the states a session can be in. */
/** `dx` moves a pet with a wide prop to the left (as a fraction of the width), so the prop never runs into the label. */
const STATES: { who: Who; scene: string; label: string; dx?: number }[] = [
  { who: 'clawd', scene: 'edit', label: 'Writing code', dx: -0.035 },
  { who: 'kodek', scene: 'bash', label: 'Running commands', dx: -0.075 },
  { who: 'opencode', scene: 'thinking', label: 'Thinking' },
  { who: 'copilot', scene: 'read', label: 'Reading files' },
  { who: 'cursor', scene: 'grep', label: 'Searching', dx: -0.035 },
  { who: 'grok', scene: 'web', label: 'Browsing the web', dx: -0.02 },
  { who: 'android', scene: 'agent', label: 'Delegating' },
  { who: 'zcode', scene: 'done', label: 'Done!' },
];

/** The seven looks, one per beat over two bars, then Clean again; light backdrops in the banner's family (Neon keeps its night). */
const LOOKS: { style: StyleId; name: string; theme: Theme }[] = [
  { style: 'sticker', name: 'Sticker', theme: { ...CREAM, bg: '#FFE9D8', glow: '#FFD1B0' } },
  { style: 'sketch', name: 'Sketch', theme: { ...CREAM, bg: '#F6F1E6', glow: '#EBE2CF', text: '#3B3A38' } },
  { style: 'clean', name: 'Clean', theme: CREAM },
  { style: 'pixel', name: 'Pixel art', theme: { ...CREAM, bg: '#E8F3EA', glow: '#C9E6D2' } },
  { style: 'neon', name: 'Neon', theme: { ...CREAM, bg: '#14111C', glow: '#3B2365', text: '#F6F2EA', sub: '#A99BC8' } },
  { style: 'ink', name: 'Ink', theme: { ...CREAM, bg: '#FFFFFF', glow: '#EDEDED', text: '#111111' } },
  { style: 'pastel', name: 'Pastel', theme: { ...CREAM, bg: '#FBE8EF', glow: '#F6CDE0' } },
  { style: 'clean', name: 'Clean', theme: CREAM },
];

const LIMITS: Limit[] = [
  { agent: 'claude', window: 'five_hour', used_pct: 34, resets_at: null }, { agent: 'claude', window: 'weekly', used_pct: 61, resets_at: null },
  { agent: 'codex', window: 'five_hour', used_pct: 12, resets_at: null }, { agent: 'codex', window: 'weekly', used_pct: 91, resets_at: null },
];

const CLAY = PAL.clay, INK = PAL.ink;
const TOAST_Y = 470;
const tk = (text: string, t: number, out?: number, color?: string): Tok => ({ text, t, out, color });

/** A slanted band in the banner's colours sweeps across; scenes switch underneath it at `cut`. */
function drawBand(x: CanvasRenderingContext2D, fmt: Format, T: number, cut: number, len = 0.34, dir = 1): void {
  const p = (T - (cut - len / 2)) / len;
  if (p < 0 || p > 1) return;
  const W = fmt.W, H = fmt.H, e = easeInOut(p), cx = W / 2 + dir * (e - 0.5) * 2.9 * W, hw = 0.85 * W, sk = 0.16 * H * dir;
  const band = (o: number, col: string) => { x.fillStyle = col; x.beginPath(); x.moveTo(cx - hw + o + sk, 0); x.lineTo(cx + hw + o + sk, 0); x.lineTo(cx + hw + o - sk, H); x.lineTo(cx - hw + o - sk, H); x.closePath(); x.fill(); };
  x.save(); band(-dir * 0.06 * W, CLAY); band(0, '#2B2622'); x.restore();
}

/** The section headline, top centre: plain words in ink, the key word in clay. */
function headline(x: CanvasRenderingContext2D, fmt: Format, T: number, parts: [string, boolean][], t0: number, out: number, size = 70): void {
  drawCaption(x, T, [parts.map(([w, key], i) => tk(w, t0 + i * 0.05, out, key ? CLAY : undefined))], { size, cx: fmt.W / 2, cy: 118, lineGap: 1.1 });
}

export class Show {
  readonly crew: Record<Who, Actor> = makeCrew();
  private seqs = new Map<string, Seq>();
  private icon = new Image();

  constructor(readonly fmt: Format) {}

  async ready(): Promise<void> {
    for (const n of ['panel', 'stats']) this.seqs.set(n, await loadMeta(n));
    this.icon.src = '/brand/icon.png'; await this.icon.decode();
  }

  /** Window recordings the frame at T needs, loaded before it is drawn. */
  async prepare(T: number): Promise<void> {
    if (T >= T_PANEL - 0.1 && T < T_STYLES + 0.2) await need('panel', frameAt(this.seqs.get('panel')!, T - T_PANEL));
    if (T >= T_STATS - 0.1 && T < T_MOD + 0.2) await need('stats', frameAt(this.seqs.get('stats')!, T - T_STATS + 0.15));
  }

  private reset(): void { for (const w of CREW) { const a = this.crew[w]; a.spec = blank(); a.spec.hidden = true; } }
  private put(w: Who, p: Partial<Actor['spec']>): void { Object.assign(this.crew[w].spec, { hidden: false }, p); }
  private draw(x: CanvasRenderingContext2D, cam: Cam, dt: number, T: number, only?: Who[]): void {
    const list = (only ?? CREW).map(w => this.crew[w]).filter(a => !a.spec.hidden).sort((a, b) => a.spec.z - b.spec.z);
    for (const a of list) a.draw(x, cam, this.fmt, dt, T);
  }

  render(x: CanvasRenderingContext2D, T: number, dt: number): void {
    this.reset();
    setInk(INK);
    if (T < T_STATES) this.intro(x, T, dt);
    else if (T < T_NEEDS) this.states(x, T, dt);
    else if (T < T_STYLES) this.taskbar(x, T, dt);
    else if (T < T_STATS) this.looks(x, T, dt);
    else if (T < T_MOD) this.stats(x, T, dt);
    else if (T < T_END) this.mod(x, T, dt);
    else this.finale(x, T, dt);
    // the bands that carry us from one section to the next
    drawBand(x, this.fmt, T, T_NEEDS, 0.34, 1);
    drawBand(x, this.fmt, T, T_STYLES, 0.34, -1);
    // fade to cream at the very end so the loop starts clean
    const f = clamp((T - (DURATION - 0.35)) / 0.35);
    if (f > 0) { x.save(); x.globalAlpha = f; x.fillStyle = CREAM.bg; x.fillRect(0, 0, this.fmt.W, this.fmt.H); x.restore(); }
  }

  /* ------------------------------------------------------------ the row on the taskbar ------------------------------------------------------------ */

  private rowCam(ground = 880): Cam { return fit({ x0: -455, x1: 455, y0: -300, y1: 70 }, this.fmt, { ground }); }

  /** The row framed a little wider (s > 1) or tighter (s < 1), the taskbar top kept at `ground` px. */
  private rowAt(s: number, ground = 880): Cam { return fit({ x0: -455 * s, x1: 455 * s, y0: -300 * s, y1: 70 * s }, this.fmt, { ground }); }

  /** 0 - 7.9 s: the crew chills on the taskbar over the breakdown. When the drums come in everyone freezes and turns to us, nods along,
   *  crouches, and jumps on the next bar: "Meet the crew." Then we dive into Clawd for the tour. */
  private intro(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W, H = fmt.H;
    const frozen = T >= NOTICE, hit = T >= HIT, sinceHit = T - HIT;
    // the camera: a slow pan while it is calm, a snap out when they notice, a pull back, a punch on the hit
    // while it is calm: close, panning slowly along the row; noticing snaps us out to the whole crew
    const pan = (t: number): Cam => { const cx = lerp(-262, 262, easeInOut(clamp(t / NOTICE))); return fit({ x0: cx - 250, x1: cx + 250, y0: -210, y1: 60 }, fmt, { ground: 930 }); };
    let cam: Cam;
    if (!frozen) cam = pan(T);
    else if (!hit) {
      const k = T - NOTICE;
      cam = mixCam(pan(NOTICE), this.rowAt(lerp(1.0, 1.04, easeInOut(clamp((k - 0.15) / (HIT - NOTICE - 0.15))))), easeOut(clamp(k / 0.16)));
    } else cam = this.rowAt(1.04 - 0.05 * Math.exp(-sinceHit * 7) * Math.cos(sinceHit * 14));
    const dive = easeIn(clamp((T - (TOUR - 0.34)) / 0.34));
    cam = mixCam(cam, { x: rowX('clawd') + 4, y: -48, z: cam.z * 9 }, dive);
    // a short shake when they notice and on the hit
    const shake = (frozen ? Math.exp(-(T - NOTICE) * 14) * 10 : 0) + (hit ? Math.exp(-sinceHit * 10) * 14 : 0);
    x.save(); x.translate(Math.sin(T * 97) * shake, Math.cos(T * 83) * shake * 0.6);
    drawBackdrop(x, fmt, cam, T, CREAM, undefined, 0);
    drawTaskbar(x, fmt, cam, T, { limits: LIMITS, bars: ROW.map(w => ({ x: rowX(w), session: { agent: w === 'clawd' ? 'claude' : 'codex', state: 'working', progress: { done: 1 + (hash(ROW.indexOf(w)) * 4 | 0), total: 6 } } })) });
    ROW.forEach((w, i) => {
      const slot = rowX(w), stagger = i * 0.025;
      if (!frozen) { this.put(w, { x: slot, y: 0, z: i, scene: CALM[w] ?? 'idle' }); return; }
      if (!hit) {
        // the drums are in: face us, arms up in surprise with a little jump, then nod along on the beats, then crouch for the jump
        const k = T - NOTICE - stagger, jump = k > 0 ? Math.max(0, Math.sin(Math.min(1, k / 0.22) * Math.PI)) * 22 : 0;
        const crouch = easeInOut(clamp((T - (HIT - 0.42)) / 0.4)), into = easeInOut(clamp((T - NOTICE - BEAT * 0.8) / 0.4));
        const nod = into * (1 - crouch) * Math.abs(Math.sin(Math.PI * (T - NOTICE) / BEAT)) * 10;
        const arms = lerp(lerp(1.7, 1.0, into), 0.5, crouch);
        this.put(w, { x: slot, y: -jump - nod, z: i, sx: 1 + 0.08 * crouch, sy: 1 - 0.13 * crouch, scene: 'puppet',
          drive: { th: 0, look: 0, ex: 0, lx: 0, armL: arms, armR: arms, oscL: 0.25 * into * (1 - crouch), oscR: 0.25 * into * (1 - crouch), _f: 8, happy: 0.7 * into * (1 - crouch) } });
        return;
      }
      // the hit: everyone jumps, lands with a squash, then bounces and waves on the beat
      const k = sinceHit - stagger, air = 0.5;
      if (k < air) {
        const u = clamp(k / air);
        this.put(w, { x: slot, y: -175 * 4 * u * (1 - u), z: i, sx: 0.95, sy: 1.07, rot: (hash(i) - 0.5) * 0.25 * Math.sin(Math.PI * u), scene: 'puppet',
          drive: { th: 0, look: -0.1, armL: 2.8, armR: 2.8, oscL: 0.4, oscR: 0.4, _f: 16, happy: 1 } });
      } else {
        const l = k - air, ph = ((T - HIT) / BEAT) % 1;
        this.put(w, { x: slot, y: -Math.max(0, Math.sin(ph * Math.PI)) * 10, z: i,
          sx: 1 + 0.12 * Math.exp(-l * 10) * Math.cos(l * 22), sy: 1 - 0.18 * Math.exp(-l * 10) * Math.cos(l * 22), scene: 'puppet',
          drive: { th: 0, look: -0.2, ex: 0, armR: 2.5, oscR: 0.6, armL: 0.6 + 0.9 * (i % 2), oscL: 0.3, _f: 10, happy: 0.95 } });
      }
    });
    this.draw(x, cam, dt, T);
    // "!" over every head as the drums come in
    if (frozen && !hit) ROW.forEach((w, i) => {
      const t0 = NOTICE + i * 0.025, age = T - t0, out = clamp((T - (NOTICE + 0.9)) / 0.15);
      if (age < 0 || out >= 1) return;
      const [px, py] = this.crew[w].pt(0, -112), sc = (age < 0.18 ? easeOutBack(age / 0.18, 2.4) : 1) * (1 - out), r = 34 * sc;
      x.save(); x.translate(px, py); x.rotate((hash(i + 3) - 0.5) * 0.4);
      x.fillStyle = CLAY; x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fill();
      x.fillStyle = '#FFF8F1'; x.font = `700 ${46 * sc}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 0, 2 * sc);
      x.restore();
    });
    // confetti from both ends of the taskbar on the hit
    if (hit) for (const side of [-1, 1]) {
      const [bx, by] = worldToScreen(cam, fmt, side * 470, 0);
      drawBurst(x, T, { t: HIT + 0.02, x: bx, y: by, n: 46, speed: 1500, dir: -Math.PI / 2 - side * 0.55, spread: 0.9, seed: side + 3, life: 2.2 }, fmt);
    }
    // name tags, left to right, once they have landed
    ROW.forEach((w, i) => {
      const t0 = HIT + 0.55 + i * 0.09;
      if (T < t0) return;
      const [tx, ty] = this.crew[w].pt(0, -100);
      drawTag(x, T, tx, ty, { name: NAMES[w].name, sub: NAMES[w].agent !== NAMES[w].name ? NAMES[w].agent : undefined, color: NAMES[w].color, t: t0, out: TOUR - 0.42, h: 44, tilt: (hash(i) - 0.5) * 0.1 });
    });
    x.restore();
    // the words: the first two over the calm and the drums coming in; the hit brings the third
    drawCaption(x, T, [[tk('Your', 0.2, 1.6), tk('coding', 0.3, 1.6), tk('agents,', 0.4, 1.6, CLAY)]], { size: 92, cx: W / 2, cy: 150 });
    drawCaption(x, T, [[tk('now', 1.7, HIT - 0.2), tk('living', 1.8, HIT - 0.18), tk('on', 1.9, HIT - 0.16), tk('your', 2.0, HIT - 0.14), tk('taskbar.', 2.1, HIT - 0.12, CLAY)]], { size: 92, cx: W / 2, cy: 150 });
    drawCaption(x, T, [[tk('Meet', HIT, TOUR - 0.4), tk('the', HIT + 0.08, TOUR - 0.4), tk('crew.', HIT + 0.16, TOUR - 0.4, CLAY)]], { size: 112, cx: W / 2, cy: 160 });
    // a white flash on the hit, and into Clawd for the tour
    const flash = hit ? 0.8 * Math.exp(-sinceHit * 9) : 0;
    const f = Math.max(flash, dive > 0.7 ? (dive - 0.7) / 0.3 * 0.85 : 0);
    if (f > 0.005) { x.save(); x.globalAlpha = f; x.fillStyle = '#FFF8F1'; x.fillRect(0, 0, W, H); x.restore(); }
  }

  /* ------------------------------------------------------------ what they show ------------------------------------------------------------ */

  /** 7.9 - 12.4 s: one pet per beat, each doing something different, big, with the state spelled out. */
  private states(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W, H = fmt.H;
    const i = clamp(Math.floor((T - T_STATES) / BEAT), 0, STATES.length - 1), since = T - (T_STATES + i * BEAT);
    const z = 4.4, cam0: Cam = { x: 0, y: -40, z };
    drawBackdrop(x, fmt, { x: 0, y: -40, z: 2 }, T, CREAM, undefined, 0);
    const show = (k: number, slide: number, alpha: number) => {
      const s = STATES[k], col = NAMES[s.who].color;
      const cx = W * (0.3 + (s.dx ?? 0)) + slide;
      // a disc in the pet's colour behind it, and a slice of taskbar to stand on
      x.save(); x.globalAlpha = 0.16 * alpha; x.fillStyle = col; x.beginPath(); x.arc(cx, H * 0.55, 300, 0, TAU); x.fill(); x.restore();
      x.save(); x.globalAlpha = alpha; x.fillStyle = PAL.bar; x.beginPath(); x.roundRect(cx - 300, H * 0.75, 600, 70, 22); x.fill(); x.restore();
      const cam: Cam = { ...cam0, x: (W / 2 - cx) / z * -1 + 0, y: (H / 2 - H * 0.75) / z };
      cam.x = -(cx - W / 2) / z;
      this.put(s.who, { x: 0, y: 0, z: 10, scene: s.scene, alpha });
      this.crew[s.who].draw(x, cam, fmt, dt, T);
      this.crew[s.who].spec.hidden = true;
      // the label: what the agent is doing, and who it is
      const lx = W * 0.565 + slide * 1.15;
      x.save(); x.globalAlpha = alpha; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
      x.font = `700 ${s.label.length > 14 ? 88 : 104}px ${FONT}`; x.fillStyle = INK; x.fillText(s.label, lx, H * 0.56);
      x.font = `700 40px ${UI_FONT}`; x.fillStyle = '#8A7D72'; x.fillText(NAMES[s.who].name === NAMES[s.who].agent ? NAMES[s.who].name : `${NAMES[s.who].name} · ${NAMES[s.who].agent}`, lx + 4, H * 0.56 + 64);
      x.fillStyle = col; x.beginPath(); x.roundRect(lx + 2, H * 0.56 - 150, 64, 10, 5); x.fill();
      x.restore();
    };
    // the outgoing pet leaves to the left as the next one slides in from the right
    if (i > 0 && since < 0.16) show(i - 1, -easeIn(since / 0.16) * W * 0.9, 1 - since / 0.16);
    show(i, (1 - easeOutBack(clamp(since / 0.24), 1.2)) * W * 0.9, 1);
    headline(x, fmt, T, [['See', false], ['what', false], ['every', false], ['agent', true], ['is', false], ['doing.', false]], T_STATES + 0.05, T_NEEDS - 0.2);
  }

  /* ------------------------------------------------------------ needs you, the panel and the limits ------------------------------------------------------------ */

  /** 12.4 - 16.9 s: back on the taskbar. Clawd needs you: a bubble, a Windows notification, one click; then the panel and the limits. */
  private taskbar(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W;
    const base = this.rowCam(), push = easeInOut(clamp((T - T_NEEDS) / (T_PANEL - T_NEEDS)));
    const cam: Cam = { ...base, x: base.x + 60 * push, z: base.z * (1 + 0.05 * push) };
    drawBackdrop(x, fmt, cam, T, CREAM, undefined, 0);
    drawTaskbar(x, fmt, cam, T, { limits: LIMITS, bars: ROW.map(w => ({ x: rowX(w), session: { agent: w === 'clawd' ? 'claude' : 'codex', state: 'working', progress: { done: 2 + (hash(ROW.indexOf(w)) * 4 | 0), total: 6 } } })) });
    const answered = T >= bar(2, 3);
    ROW.forEach((w, i) => this.put(w, { x: rowX(w), y: 0, z: i, scene: w === 'clawd' ? (answered ? 'done' : 'needs') : CALM[w] === 'sleep' ? 'idle' : (CALM[w] ?? 'idle') }));
    this.draw(x, cam, dt, T);
    const clawd = this.crew.clawd;
    // the question
    const [bx, by] = clawd.pt(16, -82);
    drawBubble(x, { text: 'Allow Bash? npm test', ax: bx, ay: by, side: 'below', size: 34, age: T - (T_NEEDS + 0.15), gone: answered ? T - bar(2, 3) : undefined });
    // the notification slides in from the corner on beat 2
    const nt = T - bar(2, 1), gone = T - bar(2, 3.4);
    if (nt > 0 && gone < 0.4) {
      const k = easeOutBack(clamp(nt / 0.35), 1.1) * (1 - easeIn(clamp(gone / 0.3)));
      this.toast(x, W - 600 + (1 - k) * 640, TOAST_Y, k, T);
    }
    // the cursor goes for Open and clicks on beat 4
    const cx0 = W * 0.55, cy0 = 640, ox = W - 600 + 150, oy = TOAST_Y + 205;
    const ct = clamp((T - bar(2, 2)) / (BEAT * 1.0));
    let curx = lerp(cx0, ox, easeInOut(ct)), cury = lerp(cy0, oy, easeInOut(ct));
    const press = Math.abs(T - bar(2, 3)) < 0.06 ? 1 : 0;
    // ... and then clicks Clawd: the panel opens from him
    const pt = T - T_PANEL;
    if (T >= bar(2, 3.3)) { const [px, py] = clawd.pt(0, -40), k2 = easeInOut(clamp((T - bar(2, 3.3)) / 0.35)); curx = lerp(ox, px, k2); cury = lerp(oy, py, k2); }
    const press2 = Math.abs(pt) < 0.06 ? 1 : 0;
    if (pt < 0.5) drawCursor(x, curx, cury, 44, 0, 1, Math.max(press, press2));
    if (pt >= 0) {
      const s = this.seqs.get('panel')!, img = frame('panel', frameAt(s, pt));
      const w = 600, h = w * s.height / s.width, k = easeOutBack(clamp(pt / 0.42), 1.15);
      const [px, py] = clawd.pt(0, -40), tx = W * 0.5 + 150, ty = 175;
      x.save(); x.translate(lerp(px, tx + w / 2, easeOut(clamp(pt / 0.42))), lerp(py, ty + h, easeOut(clamp(pt / 0.42)))); x.scale(k, k); x.translate(-w / 2, -h);
      drawWindow(x, img, s, w); x.restore();
      headline(x, fmt, T, [['Every', false], ['session', false], ['and', false], ['limit,', true], ['one', false], ['click', true], ['away.', false]], T_PANEL + 0.05, T_STYLES - 0.2, 64);
    } else headline(x, fmt, T, [['Know', false], ['the', false], ['moment', false], ['it', false], ['needs', true], ['you.', true]], T_NEEDS + 0.12, T_PANEL - 0.1);
  }

  /** A Windows 11 notification card with the app's icon and an Open button. */
  private toast(x: CanvasRenderingContext2D, left: number, top: number, k: number, T: number): void {
    const w = 540, h = 250;
    x.save(); x.globalAlpha = clamp(k * 1.5); x.translate(left, top);
    x.shadowColor = 'rgba(40,30,20,0.25)'; x.shadowBlur = 40; x.shadowOffsetY = 12;
    x.fillStyle = '#FBFBFB'; x.beginPath(); x.roundRect(0, 0, w, h, 16); x.fill();
    x.shadowColor = 'transparent'; x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 2; x.stroke();
    x.drawImage(this.icon, 24, 22, 36, 36);
    x.font = `600 22px ${UI_FONT}`; x.fillStyle = '#5E5A56'; x.textBaseline = 'middle'; x.fillText('Agent Pets', 72, 40);
    x.font = `700 30px ${UI_FONT}`; x.fillStyle = '#1B1B1B'; x.fillText('Claude Code needs you', 24, 96);
    x.font = `600 26px ${UI_FONT}`; x.fillStyle = '#444'; x.fillText('Allow Bash? npm test', 24, 136);
    const press = Math.abs(T - bar(2, 3)) < 0.08;
    x.fillStyle = press ? '#B85F42' : CLAY; x.beginPath(); x.roundRect(24, 176, 236, 52, 10); x.fill();
    x.fillStyle = '#E9E7E4'; x.beginPath(); x.roundRect(280, 176, 236, 52, 10); x.fill();
    x.textAlign = 'center'; x.font = `700 24px ${UI_FONT}`; x.fillStyle = '#FFF'; x.fillText('Open', 142, 203); x.fillStyle = '#333'; x.fillText('Dismiss', 398, 203);
    x.restore();
  }

  /* ------------------------------------------------------------ the seven looks ------------------------------------------------------------ */

  /** 16.9 - 21.5 s: Clawd and Kodek (the two that have every look) flip through all seven, one per beat. */
  private looks(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W, H = fmt.H;
    const i = clamp(Math.floor((T - T_STYLES) / BEAT), 0, LOOKS.length - 1), L = LOOKS[i], prev = LOOKS[Math.max(0, i - 1)], since = T - (T_STYLES + i * BEAT);
    const cam: Cam = { x: 0, y: -60, z: 4.0 };
    drawBackdrop(x, fmt, cam, T, L.theme, i > 0 ? { prev: prev.theme, k: clamp(since / 0.2), cx: W / 2, cy: H * 0.6 } : undefined, 0);
    setInk(L.theme.text);
    // a slice of taskbar
    const [gx, gy] = worldToScreen(cam, fmt, 0, 0);
    x.fillStyle = PAL.bar; x.beginPath(); x.roundRect(gx - 520, gy, 1040, 64 * cam.z * 0.35, 24); x.fill();
    const hop = (t: number) => { const ph = (((t - T_STYLES) / BEAT) % 1 + 1) % 1; return -18 * Math.max(0, Math.sin(ph * Math.PI)) * (ph < 0.5 ? 1 : 0.4); };
    this.put('clawd', { x: -78, y: hop(T), z: 1, look: { style: L.style, motion: 'calm' }, drive: { happy: 0.9, armL: 2.3, armR: 2.3, oscL: 0.4, oscR: 0.4, _f: 10, look: -0.1 } });
    this.put('kodek', { x: 78, y: hop(T - 0.06), z: 2, look: { style: L.style, motion: 'calm' }, drive: { happy: 0.9, armL: 2.3, armR: 2.3, oscL: 0.4, oscR: 0.4, _f: 10, look: -0.1 } });
    this.draw(x, cam, dt, T, ['clawd', 'kodek']);
    // the name of the look, big and centred, popping on its half beat
    const sc = easeOutBack(clamp(since / 0.2), 1.6);
    x.save(); x.translate(W / 2, H * 0.3); x.scale(sc, sc); x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 120px ${FONT}`; x.fillStyle = L.theme.text; x.fillText(L.name, 0, 0); x.restore();
    headline(x, fmt, T, [['7', true], ['styles.', true], ['Pick', false], ['your', false], ['vibe.', false]], T_STYLES + 0.05, T_STATS - 0.15, 56);
  }

  /* ------------------------------------------------------------ stats ------------------------------------------------------------ */

  private stats(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W, H = fmt.H, a = T - T_STATS;
    drawBackdrop(x, fmt, { x: 0, y: 0, z: 2 }, T, CREAM, undefined, 0);
    const s = this.seqs.get('stats')!, img = frame('stats', frameAt(s, a + 0.15));
    const w = 1180, h = w * s.height / s.width, k = easeOutBack(clamp(a / 0.45), 1.2);
    x.save(); x.translate(W / 2, 200 + h / 2 + (1 - k) * 600); x.rotate((1 - easeOut(clamp(a / 0.45))) * 0.06); x.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); x.translate(-w / 2, -h / 2);
    drawWindow(x, img, s, w); x.restore();
    const bursts: Burst[] = [
      { t: T_STATS + BEAT, x: W * 0.12, y: H * 1.02, n: 30, speed: 1500, dir: -1.1, spread: 0.6, seed: 4, size: 1.4, life: 2.2 },
      { t: T_STATS + BEAT, x: W * 0.88, y: H * 1.02, n: 30, speed: 1500, dir: -Math.PI + 1.1, spread: 0.6, seed: 9, size: 1.4, life: 2.2 },
    ];
    for (const b of bursts) drawBurst(x, T, b, fmt);
    headline(x, fmt, T, [['Fun', false], ['stats', true], ['for', false], ['your', false], ['projects.', false]], T_STATS + 0.08, T_MOD - 0.12);
    void dt;
  }

  /* ------------------------------------------------------------ the Claude Code mod ------------------------------------------------------------ */

  /** 21.5 - 23.7 s: a terminal with Claude Code: pixel Clawd above the prompt, /pets typed in and the pane listing the crew and the limits. */
  private mod(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W, a = T - T_MOD;
    drawBackdrop(x, fmt, { x: 0, y: 0, z: 2 }, T, CREAM, undefined, 0);
    const w = 1240, h = 700, k = easeOutBack(clamp(a / 0.4), 1.2), left = (W - w) / 2, top = 230 + (1 - k) * 500;
    x.save(); x.translate(left, top);
    x.shadowColor = 'rgba(40,30,20,0.3)'; x.shadowBlur = 60; x.shadowOffsetY = 20;
    x.fillStyle = '#1E1C1B'; x.beginPath(); x.roundRect(0, 0, w, h, 20); x.fill(); x.shadowColor = 'transparent';
    x.fillStyle = '#2C2927'; x.beginPath(); x.roundRect(0, 0, w, 54, [20, 20, 0, 0]); x.fill();
    ['#F2B8A0', '#F4D089', '#B7DDC7'].forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(30 + i * 28, 27, 9, 0, TAU); x.fill(); });
    x.font = `600 22px ${UI_FONT}`; x.fillStyle = '#A8A29C'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('claude — ~/projects/app', w / 2, 27);
    x.restore();
    const mono = '600 30px "DejaVu Sans Mono", monospace', lh = 46, X0 = left + 60;
    let y = top + 120;
    const line = (txt: string, t: number, col = '#E8E2DC') => { if (a < t) return; x.save(); x.font = mono; x.fillStyle = col; x.textAlign = 'left'; x.textBaseline = 'middle'; x.globalAlpha = clamp((a - t) / 0.08); x.fillText(txt, X0, y); x.restore(); };
    // the prompt, and /pets typed in on beat 1
    const typed = '/pets'.slice(0, Math.max(0, Math.floor((a - BEAT * 0.6) / 0.06)));
    line('> ' + typed + (Math.floor(a * 3) % 2 === 0 && typed.length < 5 ? '▌' : ''), 0.15, '#F2EDE8');
    y += lh * 1.4;
    const rows: [string, string][] = [['Agent Pets — 3 sessions', '#D97757'], ['  ● Parser refactor     Writing code', '#E8E2DC'], ['  ● Test migration      Done', '#E8E2DC'], ['  ● UIA research        Waiting for you', '#E8E2DC'], ['', ''], ['  Claude 5h   ███░░░░░░░  34%', '#C9C2BB'], ['  Claude week ██████░░░░  61%', '#C9C2BB']];
    rows.forEach(([txt, col], i) => { if (txt) line(txt, BEAT * 1.6 + i * BEAT * 0.25, col); y += lh; });
    // pixel Clawd sits above the prompt, at the right, mirroring the session
    const cam: Cam = { x: 0, y: 0, z: 2.6 };
    const px = left + w - 230, py = top + 250;
    cam.x = -(px - W / 2) / cam.z; cam.y = -(py - fmt.H / 2) / cam.z;
    this.put('clawd', { x: 0, y: 0, z: 1, look: { style: 'pixel', motion: 'calm' }, scene: a < BEAT * 1.6 ? 'thinking' : 'done' });
    this.draw(x, cam, dt, T, ['clawd']);
    headline(x, fmt, T, [['Now', false], ['inside', false], ['Claude', true], ['Code', true], ['too.', false]], T_MOD + 0.08, T_END - 0.1);
  }

  /* ------------------------------------------------------------ the crew and the end card ------------------------------------------------------------ */

  private finale(x: CanvasRenderingContext2D, T: number, dt: number): void {
    const { fmt } = this, W = fmt.W, H = fmt.H;
    const cam: Cam = { x: 0, y: (H / 2 - 990) / 2.35, z: 2.35 };
    drawBackdrop(x, fmt, cam, T, CREAM, undefined, 0);
    drawTaskbar(x, fmt, cam, T, { limits: LIMITS, bars: ROW.map((_, i) => ({ x: (i - 3.5) * 74, session: { agent: 'claude', state: 'working', progress: { done: 3, total: 6 } } })) });
    // on the final hit the whole crew drops in for the group photo, a frame or two apart, and waves
    ROW.forEach((w, i) => {
      const t0 = T_END + i * 0.035, u = clamp((T - t0) / 0.28), land = T - (t0 + 0.28);
      if (T < t0) return;
      const sq = land > 0 ? 0.2 * Math.exp(-land * 9) * Math.cos(land * 24) : -0.08;
      const bob = land > 0.4 ? -6 * Math.max(0, Math.sin((T - T_END) * TAU / (BEAT * 2) - i * 0.4)) : 0;
      this.put(w, { x: (i - 3.5) * 74, y: -360 * (1 - u) * (1 - u) + bob, z: i, sx: 1 + sq * 0.6, sy: 1 - sq, drive: land < 0 ? { armL: 2.7, armR: 2.7, look: -0.2 } : { happy: 1, armR: 2.4, oscR: 0.5, _f: 8 + i, armL: 0.4, look: -0.1, ex: 0 } });
    });
    this.draw(x, cam, dt, T);
    // flash on the final hit, then the card
    const a = T - T_END;
    if (a < 0.3) { x.save(); x.globalAlpha = (1 - a / 0.3) * 0.75; x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H); x.restore(); }
    const C = W / 2;
    drawCaption(x, T, [[tk('Agent', T_END + 0.05), tk('Pets', T_END + 0.15)]], { size: 150, cx: C, cy: 230 });
    drawCaption(x, T, [[tk('Your', T_END + 0.5), tk('coding', T_END + 0.55), tk('agents,', T_END + 0.6), tk('live', T_END + 0.75), tk('on', T_END + 0.8), tk('your', T_END + 0.85), tk('taskbar.', T_END + 0.9, undefined, CLAY)]], { size: 52, cx: C, cy: 372, weight: 600 });
    const pa = clamp((a - 1.0) / 0.3);
    if (pa > 0) {
      x.save(); x.globalAlpha = pa; x.font = `700 38px ${FONT}`; const txt = 'Free & open source · Windows 11', tw = x.measureText(txt).width, sc = 0.9 + 0.1 * easeOutBack(pa);
      x.translate(C, 462); x.scale(sc, sc);
      x.fillStyle = CLAY; x.beginPath(); x.roundRect(-tw / 2 - 28, -34, tw + 56, 68, 34); x.fill();
      x.fillStyle = '#FFF7F0'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 0, 2); x.restore();
      x.save(); x.globalAlpha = clamp((a - 1.2) / 0.3); x.font = `700 34px ${UI_FONT}`; x.fillStyle = INK; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('github.com/Marczelloo/agent-pets', C, 545); x.restore();
      x.save(); x.globalAlpha = clamp((a - 1.4) / 0.3) * 0.9; x.font = `600 17px ${UI_FONT}`; x.fillStyle = '#8A7D72'; x.textAlign = 'center';
      ['GPL-3.0 · Not affiliated with Anthropic, OpenAI, GitHub, Google, Cursor, xAI, Z.ai or opencode · Android robot by Google, CC BY 3.0'].forEach((l, i) => x.fillText(l, C, 600 + i * 24));
      x.restore();
    }
  }
}
