// Agent Pets landing page. Every pet is drawn by the app's own renderer (app/src), bundled into this one file.
import { Actor, CREW, Stage, run } from './engine';
import { hero } from './hero';
import { crew } from './crew';
import { states } from './states';
import { strip } from './strip';
import { looks } from './looks';
import { mod } from './mod';
import { door } from './door';
import { releases } from './releases';
import { dock } from './dock';
import { privacy } from './privacy';

// what the hooks send, scrolling under the hero
const TICKER: [string, string, string][] = [
  ['UserPromptSubmit', 'thinking', '--teal'], ['PreToolUse Edit · App.tsx', 'editing', '--clay'], ['PreToolUse Bash · npm test', 'running a command', '--clay'],
  ['PreToolUse Read · layout.ts', 'reading', '--sky'], ['PreToolUse Grep · "sceneFor"', 'searching', '--sky'], ['PreToolUse WebFetch · docs.rs', 'browsing', '--sky'],
  ['SubagentStart · Explore', 'delegating', '--amber'], ['PermissionRequest · Bash', 'needs you', '--amber'], ['Stop', 'done', '--leaf'],
  ['StopFailure', 'error', '--clay'], ['PreCompact', 'compacting', '--teal'], ['no events for 10 min', 'asleep', '--mute'],
];
function ticker(): void {
  const items = TICKER.map(([ev, st, c]) => `<span>${ev} → <b style="--c: var(${c})">${st}</b></span>`).join('');
  document.querySelector('.ticker-track')!.innerHTML = items + items;
}

// the crew asleep on the footer; a pet wakes up while the cursor is near
function footer(): void {
  const pets = CREW.map(c => new Actor(c.agent, 'sleep', c.name ?? null));
  new Stage(document.querySelector('.foot-stage')!, (s, dt, T) => {
    const n = s.w < 560 ? 4 : s.w < 900 ? 6 : 9, u = s.w < 560 ? .55 : .7, gap = Math.min(150, (s.w - 40) / n);
    const x0 = (s.w - gap * (n - 1)) / 2;
    pets.slice(0, n).forEach((p, i) => {
      p.u = u; p.x = x0 + gap * i; p.y = s.h - 18;
      const near = s.pointer.in && Math.abs(s.pointer.x - p.x) < gap / 2;
      p.set(near ? 'idle' : 'sleep');
      p.step(dt); p.draw(s.x, dt, T, s.dpr);
    });
  });
}

function boot(): void {
  // one section failing must not take the others down
  for (const part of [ticker, hero, crew, states, strip, looks, mod, door, privacy, releases, footer, dock]) {
    try { part(); } catch (e) { console.error(`${part.name}:`, e); }
  }
  run();
}
boot();
