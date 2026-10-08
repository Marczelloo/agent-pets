// The state console: a hook event comes in, the pet acts it out, with the app's bubble and progress bar.
import { Actor, BODY, CREW, MONO, REDUCED, Stage, bubble, tone } from './engine';
import { drawBar, limitsAt, progress } from './bar';
import type { State } from '@app/types';

interface Ev { scene: string; state: State; event: string; label: string; short?: string; say?: string; ask?: string; sym: string }
const EVENTS: Ev[] = [
  { scene: 'thinking', state: 'thinking', event: 'UserPromptSubmit', label: 'thinking', sym: '…' },
  { scene: 'edit', state: 'working', event: 'PreToolUse Edit', label: 'editing', say: 'Editing App.tsx', sym: '✎' },
  { scene: 'bash', state: 'working', event: 'PreToolUse Bash', label: 'running a command', short: 'command', say: 'npm test', sym: '$' },
  { scene: 'read', state: 'working', event: 'PreToolUse Read', label: 'reading', say: 'Reading layout.ts', sym: '¶' },
  { scene: 'grep', state: 'working', event: 'PreToolUse Grep', label: 'searching', say: 'Searching "sceneFor"', sym: '⌕' },
  { scene: 'web', state: 'working', event: 'PreToolUse WebFetch', label: 'browsing', say: 'Fetching docs.rs', sym: '◍' },
  { scene: 'agent', state: 'working', event: 'SubagentStart', label: 'delegating', say: 'Explore: find the hooks', sym: '⑂' },
  { scene: 'needs', state: 'needs_you', event: 'PermissionRequest', label: 'needs you', ask: 'Allow Bash? cargo publish', sym: '!' },
  { scene: 'done', state: 'done', event: 'Stop', label: 'done', sym: '✓' },
  { scene: 'error', state: 'error', event: 'StopFailure', label: 'error', sym: '✕' },
  { scene: 'compact', state: 'compacting', event: 'PreCompact', label: 'compacting', sym: '≋' },
  { scene: 'sleep', state: 'sleep', event: 'no events for a while', label: 'asleep', sym: 'z' },
];
const DUR = 3.6;
// a phone shows the states as tiles under the stage, and the hook event as a caption on it
const PHONE = matchMedia('(max-width: 720px)');

export function states(): void {
  const list = document.querySelector<HTMLOListElement>('.events')!;
  const who = document.querySelector<HTMLDivElement>('.who')!;
  list.innerHTML = EVENTS.map((e, i) => `<li><button type="button" data-i="${i}" style="--dur:${DUR}s"><span class="sym" aria-hidden="true">${e.sym}</span><span class="ev">${e.event}</span><span class="st">${e.label}</span><span class="tile" aria-hidden="true">${e.short ?? e.label}</span></button></li>`).join('');
  const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')];
  // every pet can act every state
  const NAMES = ['Clawd', 'Kodek', 'opencode', 'Copilot', 'Android', 'Cursor', 'Grok', 'ZCode', 'blob'];
  who.innerHTML = CREW.map((c, k) => `<button type="button" data-k="${k}" aria-pressed="${k === 0}" aria-label="${NAMES[k]}" title="${c.label}"><canvas aria-hidden="true"></canvas><span>${NAMES[k]}</span></button>`).join('');
  const whoBtns = [...who.querySelectorAll<HTMLButtonElement>('button')];
  // each button shows its pet, small and standing
  whoBtns.forEach((b, k) => {
    const c = CREW[k], a = new Actor(c.agent, 'stand', c.name ?? null);
    new Stage(b.querySelector('canvas')!, (s, dt, T) => {
      a.u = 1; a.u = Math.min((s.w - 2) / a.width, (s.h - 3) / a.height);
      a.x = s.w / 2; a.y = s.h - 2;
      a.step(dt); a.draw(s.x, dt, T, s.dpr);
    }, { interactive: false });
  });

  let cur = 0, timer = 0, auto = !REDUCED, seen = false, since = 0;
  let pet = new Actor(CREW[0].agent, EVENTS[0].scene);
  const minis = [new Actor('claude', 'read'), new Actor('claude', 'grep')];

  const pick = (i: number, manual: boolean) => {
    cur = i; timer = 0; since = 0;
    if (manual) auto = false;
    pet.set(EVENTS[i].scene);
    if (EVENTS[i].scene === 'done') pet.hop(240);
    minis.forEach(m => { m.hidden = EVENTS[i].scene !== 'agent'; if (!m.hidden) m.drop(120); });
    buttons.forEach((b, k) => {
      b.setAttribute('aria-current', String(k === i));
      b.classList.toggle('paused', !auto);
      // restart the progress line
      if (k === i) { b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; }
    });
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => pick(i, true)));
  let chosen = 0;
  const choose = (i: number) => {
    if (i === chosen) return;
    chosen = i;
    whoBtns.forEach((o, k) => o.setAttribute('aria-pressed', String(k === i)));
    const c = CREW[i];
    const old = pet;
    pet = new Actor(c.agent, EVENTS[cur].scene, c.name ?? null);
    pet.x = old.x; pet.y = old.y; pet.u = old.u; pet.drop(160);
    minis.forEach((m, k) => { const n = new Actor(c.agent, k ? 'grep' : 'read', c.name ?? null); n.hidden = m.hidden; minis[k] = n; });
  };
  whoBtns.forEach((b, k) => b.addEventListener('click', () => { choose(k); go(k); }));
  const go = reel(who, NAMES, choose);

  const stage = new Stage(document.querySelector('.state-stage')!, (s, dt, T) => {
    const x = s.x, barH = 46, barY = s.h - barH - 18;
    // start playing from the first state once it comes on screen
    if (!seen) { seen = true; pick(0, false); }
    if (auto) { timer += dt; if (timer > DUR) pick((cur + 1) % EVENTS.length, false); }
    since += dt;
    const lim = limitsAt(T);
    const narrow = s.w < 520, icons = narrow ? 2 : 4, ic = Math.min(26, barH * .56);
    const tray = drawBar(x, 18, barY, s.w - 36, barH, { limits: lim, z: 1.1, icons });
    const u = Math.max(.9, Math.min(1.75, s.w / 420));
    // while delegating, the parent slides right to make room for its subagents
    const room = EVENTS[cur].scene === 'agent';
    // the pet's progress line sits on the bar, so it keeps clear of the app icons and of the tray
    const lo = 18 + barH * .45 + (icons - 1) * ic * 1.7 + ic + 34, hi = tray - 30;
    const want = s.w * (room ? (narrow ? .64 : .58) : (narrow ? .36 : .4));
    const tx = hi > lo ? Math.max(lo, Math.min(hi, want)) : (lo + hi) / 2;
    pet.u = u; pet.x = pet.x ? pet.x + (tx - pet.x) * Math.min(1, dt * 6) : tx; pet.y = barY;
    pet.step(dt); pet.draw(x, dt, T, s.dpr);
    // subagents stand to the parent's left, clear of its arms and of each other
    minis.forEach((m, k) => {
      m.u = u * .55;
      m.x = pet.x - pet.width / 2 - 26 * u - m.width / 2 - k * (m.width + 18 * u); m.y = barY;
      if (!m.hidden) { m.step(dt); m.draw(x, dt, T, s.dpr); }
    });
    const e = EVENTS[cur];
    if (PHONE.matches) {
      // the hook event that started it, since the tiles below have room only for the state
      x.font = `600 11.5px ${MONO}`; x.textBaseline = 'top'; x.textAlign = 'left';
      x.fillStyle = tone['ink-2']; x.fillText(e.event, 16, 14);
      const w = x.measureText(e.event + ' ').width;
      x.fillStyle = tone.ink; x.fillText('→ ' + e.label, 16 + w, 14);
    }
    progress(x, pet.x, barY + 6, 1.6, { agent: pet.agent, state: e.state, progress: e.state === 'working' ? { done: 3 + (cur % 4), total: 8 } : null }, T);
    const zoom = Math.max(1, Math.min(1.35, s.w / 520));
    if (e.ask) bubble(x, pet, e.ask, 'question', zoom, s.dpr, s.w);
    else if (e.say && since < 3) bubble(x, pet, e.say, 'action', zoom, s.dpr, s.w);
  });
  stage.onClick = (px, py) => { if (pet.hit(px, py, 20)) pet.poke('cheer', 1.4); };
  pick(0, false);
}

/**
 * On a phone the pet picker is an endless reel: the chosen pet stands in the middle, a little bigger, with its
 * name under it and a soft light at its feet; the others shrink and fade towards the edges. Swipe, flick or tap.
 * Returns a function that turns the reel to a pet (the desktop pills call it, so both stay in step).
 */
function reel(who: HTMLElement, names: string[], choose: (i: number) => void): (i: number) => void {
  const n = CREW.length;
  const canvas = document.createElement('canvas');
  canvas.className = 'who-reel';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'slider');
  canvas.setAttribute('aria-label', 'Pet');
  canvas.setAttribute('aria-valuemin', '1'); canvas.setAttribute('aria-valuemax', String(n));
  who.append(canvas);
  const actors = CREW.map(c => new Actor(c.agent, 'stand', c.name ?? null));
  // `off` and `aim` never wrap: the reel only draws them modulo the crew, so it turns on forever both ways
  let off = 0, aim = 0, cell = 76, hinted = false, hint = 0;
  let drag: { x0: number; off0: number; t: number; o: number; v: number; moved: boolean } | null = null, dragged = false;
  const wrap = (v: number) => ((v % n) + n) % n;
  const settle = (to: number) => {
    aim = to;
    const k = wrap(Math.round(to));
    canvas.setAttribute('aria-valuenow', String(k + 1)); canvas.setAttribute('aria-valuetext', names[k]);
    choose(k);
  };
  settle(0);

  const stage = new Stage(canvas, (s, dt, T) => {
    const x = s.x, mid = s.w / 2, floor = s.h - 24;
    cell = Math.max(64, Math.min(88, s.w / 4.8));
    // the first time it shows, the reel leans a little to one side and back: it can turn
    if (!hinted && !REDUCED) { hint += dt; if (hint > .5 && hint < 1.5 && !drag) off = aim + Math.sin((hint - .5) * Math.PI) * .32; if (hint >= 1.5) hinted = true; }
    if (!drag && (hinted || REDUCED)) off += (aim - off) * (REDUCED ? 1 : Math.min(1, dt * 9));
    // a soft light where the chosen pet stands
    const g = x.createRadialGradient(mid, floor, 0, mid, floor, cell * .62);
    g.addColorStop(0, tone.teal + '66'); g.addColorStop(1, tone.teal + '00');
    x.fillStyle = g; x.beginPath(); x.ellipse(mid, floor, cell * .62, 12, 0, 0, Math.PI * 2); x.fill();
    // the far ones first, so the middle one stands in front
    const order = actors.map((a, i) => { let r = wrap(i - off + n / 2) - n / 2; return { a, i, r }; }).sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
    for (const { a, i, r } of order) {
      const px = mid + r * cell, d = Math.abs(r);
      if (px < -cell || px > s.w + cell) continue;
      const near = Math.max(0, 1 - d), big = .62 + .38 * near;
      // every pet fits the same box, whatever its own size
      a.u = 1; a.u = Math.min(cell * .78 / a.width, (floor - 8) / a.height) * big;
      a.x = px; a.y = floor;
      a.pet.gaze = Math.max(-1, Math.min(1, -r * .6));
      // fades with the distance from the middle, and once more near the edges
      const edge = Math.min(1, Math.min(px, s.w - px) / (cell * 1.1));
      a.alpha = Math.max(0, (.38 + .62 * near) * edge);
      a.step(dt); a.draw(x, dt, T, s.dpr);
      // only the one in the middle is named
      const named = Math.max(0, 1 - d * 2.5);
      if (named > .01) {
        x.globalAlpha = named * edge;
        x.fillStyle = tone.ink; x.font = `800 13px ${BODY}`; x.textAlign = 'center'; x.textBaseline = 'top';
        x.fillText(names[i], px, floor + 6);
        x.globalAlpha = 1;
      }
    }
    // quiet chevrons at the ends, drifting a hair outwards
    const nudge = REDUCED ? 0 : (Math.sin(T * 2.2) + 1) * 1.5;
    x.strokeStyle = tone['ink-2']; x.lineWidth = 1.6; x.lineCap = 'round'; x.lineJoin = 'round'; x.globalAlpha = .4;
    const cy = floor - 22;
    for (const side of [-1, 1]) {
      const cx = side < 0 ? 9 - nudge : s.w - 9 + nudge;
      x.beginPath(); x.moveTo(cx - side * 3, cy - 6); x.lineTo(cx + side * 3, cy); x.lineTo(cx - side * 3, cy + 6); x.stroke();
    }
    x.globalAlpha = 1;
  });

  canvas.addEventListener('pointerdown', e => {
    if (e.button) return;
    hinted = true;
    drag = { x0: e.clientX, off0: off, t: e.timeStamp, o: off, v: 0, moved: false };
    dragged = false;
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) > 8) { drag.moved = true; try { canvas.setPointerCapture(e.pointerId); } catch { /* already gone */ } }
    if (!drag.moved) return;
    off = drag.off0 - dx / cell;
    const dt = Math.max(1, e.timeStamp - drag.t) / 1000;
    drag.v = drag.v * .6 + (off - drag.o) / dt * .4; drag.o = off; drag.t = e.timeStamp;
  });
  const release = () => {
    if (!drag) return;
    // a flick carries on a little further
    if (drag.moved) { dragged = true; settle(Math.round(off + Math.max(-3, Math.min(3, drag.v * .18)))); }
    drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  // a tap on a neighbour brings it to the middle; a tap on the middle one makes it jump
  stage.onClick = px => {
    if (dragged) { dragged = false; return; }
    const r = Math.round((px - stage.w / 2) / cell);
    if (r) settle(Math.round(aim) + r); else actors[wrap(Math.round(aim))].hop(200);
  };
  canvas.addEventListener('keydown', e => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step) { e.preventDefault(); hinted = true; settle(Math.round(aim) + step); }
  });
  // the shortest way round to pet i
  return (i: number) => { const k = wrap(Math.round(aim)); let d = i - k; if (d > n / 2) d -= n; if (d < -n / 2) d += n; if (d) settle(Math.round(aim) + d); };
}
