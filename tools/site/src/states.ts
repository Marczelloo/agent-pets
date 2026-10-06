// The state console: a hook event comes in, the pet acts it out, with the app's bubble and progress bar.
import { Actor, CREW, REDUCED, Stage, bubble } from './engine';
import { drawBar, limitsAt, progress } from './bar';
import type { State } from '@app/types';

interface Ev { scene: string; state: State; event: string; label: string; say?: string; ask?: string; sym: string }
const EVENTS: Ev[] = [
  { scene: 'thinking', state: 'thinking', event: 'UserPromptSubmit', label: 'thinking', sym: '…' },
  { scene: 'edit', state: 'working', event: 'PreToolUse Edit', label: 'editing', say: 'Editing App.tsx', sym: '✎' },
  { scene: 'bash', state: 'working', event: 'PreToolUse Bash', label: 'running a command', say: 'npm test', sym: '$' },
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

export function states(): void {
  const list = document.querySelector<HTMLOListElement>('.events')!;
  const who = document.querySelector<HTMLDivElement>('.who')!;
  list.innerHTML = EVENTS.map((e, i) => `<li><button type="button" data-i="${i}" style="--dur:${DUR}s"><span class="sym" aria-hidden="true">${e.sym}</span><span class="ev">${e.event}</span><span class="st">${e.label}</span></button></li>`).join('');
  const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')];
  // pets that act every state well: the core three and the Android
  const CAST = [0, 1, 2, 4, 7];
  who.innerHTML = CAST.map((k, i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${CREW[k].pet === 'cyclops' ? 'opencode' : CREW[k].pet}</button>`).join('');
  const whoBtns = [...who.querySelectorAll<HTMLButtonElement>('button')];

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
  whoBtns.forEach(b => b.addEventListener('click', () => {
    whoBtns.forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    const c = CREW[Number(b.dataset.k)];
    const old = pet;
    pet = new Actor(c.agent, EVENTS[cur].scene);
    pet.x = old.x; pet.y = old.y; pet.u = old.u; pet.drop(160);
    minis.forEach((m, k) => { const n = new Actor(c.agent, k ? 'grep' : 'read'); n.hidden = m.hidden; minis[k] = n; });
  }));

  const stage = new Stage(document.querySelector('.state-stage')!, (s, dt, T) => {
    const x = s.x, barH = 46, barY = s.h - barH - 18;
    if (auto && seen) { timer += dt; if (timer > DUR) pick((cur + 1) % EVENTS.length, false); }
    since += dt;
    const lim = limitsAt(T);
    drawBar(x, 18, barY, s.w - 36, barH, { limits: lim, z: 1.1 });
    const u = Math.max(.9, Math.min(1.75, s.w / 420));
    pet.u = u; pet.x = s.w * (s.w < 520 ? .36 : .4); pet.y = barY;
    pet.step(dt); pet.draw(x, dt, T, s.dpr);
    minis.forEach((m, k) => {
      m.u = u * .55; m.x = pet.x - pet.width * .62 - k * 46 * u * .55; m.y = barY;
      if (!m.hidden) { m.step(dt); m.draw(x, dt, T, s.dpr); }
    });
    const e = EVENTS[cur];
    progress(x, pet.x, barY + 6, 1.6, { agent: pet.agent, state: e.state, progress: e.state === 'working' ? { done: 3 + (cur % 4), total: 8 } : null }, T);
    const zoom = Math.max(1, Math.min(1.35, s.w / 520));
    if (e.ask) bubble(x, pet, e.ask, 'question', zoom, s.dpr, s.w);
    else if (e.say && since < 3) bubble(x, pet, e.say, 'action', zoom, s.dpr, s.w);
  });
  // start playing once it is on screen
  new IntersectionObserver(es => { if (es[0].isIntersecting && !seen) { seen = true; pick(0, false); } }, { threshold: .4 }).observe(stage.canvas);
  stage.onClick = (px, py) => { if (pet.hit(px, py, 20)) pet.poke('cheer', 1.4); };
  pick(0, false);
}
