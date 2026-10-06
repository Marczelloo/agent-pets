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
  // every pet can act every state
  const NAMES = ['Clawd', 'Kodek', 'opencode', 'Copilot', 'Android', 'Cursor', 'Grok', 'ZCode', 'blob'];
  who.innerHTML = CREW.map((c, k) => `<button type="button" data-k="${k}" aria-pressed="${k === 0}" title="${c.label}">${NAMES[k]}</button>`).join('');
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
    pet = new Actor(c.agent, EVENTS[cur].scene, c.name ?? null);
    pet.x = old.x; pet.y = old.y; pet.u = old.u; pet.drop(160);
    minis.forEach((m, k) => { const n = new Actor(c.agent, k ? 'grep' : 'read', c.name ?? null); n.hidden = m.hidden; minis[k] = n; });
  }));

  const stage = new Stage(document.querySelector('.state-stage')!, (s, dt, T) => {
    const x = s.x, barH = 46, barY = s.h - barH - 18;
    // start playing from the first state once it comes on screen
    if (!seen) { seen = true; pick(0, false); }
    if (auto) { timer += dt; if (timer > DUR) pick((cur + 1) % EVENTS.length, false); }
    since += dt;
    const lim = limitsAt(T);
    drawBar(x, 18, barY, s.w - 36, barH, { limits: lim, z: 1.1 });
    const u = Math.max(.9, Math.min(1.75, s.w / 420));
    // while delegating, the parent slides right to make room for its subagents
    const narrow = s.w < 520, room = EVENTS[cur].scene === 'agent';
    const tx = s.w * (room ? (narrow ? .64 : .58) : (narrow ? .36 : .4));
    pet.u = u; pet.x = pet.x ? pet.x + (tx - pet.x) * Math.min(1, dt * 6) : tx; pet.y = barY;
    pet.step(dt); pet.draw(x, dt, T, s.dpr);
    // subagents stand to the parent's left, clear of its arms and of each other
    minis.forEach((m, k) => {
      m.u = u * .55;
      m.x = pet.x - pet.width / 2 - 26 * u - m.width / 2 - k * (m.width + 18 * u); m.y = barY;
      if (!m.hidden) { m.step(dt); m.draw(x, dt, T, s.dpr); }
    });
    const e = EVENTS[cur];
    progress(x, pet.x, barY + 6, 1.6, { agent: pet.agent, state: e.state, progress: e.state === 'working' ? { done: 3 + (cur % 4), total: 8 } : null }, T);
    const zoom = Math.max(1, Math.min(1.35, s.w / 520));
    if (e.ask) bubble(x, pet, e.ask, 'question', zoom, s.dpr, s.w);
    else if (e.say && since < 3) bubble(x, pet, e.say, 'action', zoom, s.dpr, s.w);
  });
  stage.onClick = (px, py) => { if (pet.hit(px, py, 20)) pet.poke('cheer', 1.4); };
  pick(0, false);
}
