// Agent Pets landing page. Every pet is drawn by the app's own renderer (app/src), bundled into this one file.
import { Actor, CREW, Stage, run, tone } from './engine';
import type { Look } from '@app/types';
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

// night on the footer: the crew asleep in Neon under a few stars; the one under the cursor wakes up and waves
const NEON: Look = { style: 'neon', motion: 'calm' };
function footer(): void {
  const pets = CREW.map(c => { const a = new Actor(c.agent, 'sleep', c.name ?? null); a.look = NEON; return a; });
  const stars = Array.from({ length: 34 }, (_, i) => ({ x: (i * 0.618034) % 1, y: ((i * 7919) % 97) / 97, p: i * 1.7 }));
  const stage = new Stage(document.querySelector('.foot-stage')!, (s, dt, T) => {
    const x = s.x, n = s.w < 520 ? 4 : s.w < 860 ? 6 : 9, gap = s.w / n, u = Math.min(.8, gap / 135), floor = s.h - 16;
    stars.forEach(st => {
      x.globalAlpha = .25 + .35 * (.5 + .5 * Math.sin(T * 1.3 + st.p));
      x.fillStyle = tone['bar-ink']; x.fillRect(st.x * s.w, st.y * (s.h - 90), 2, 2);
    });
    x.globalAlpha = 1;
    x.fillStyle = tone['bar-2']; x.fillRect(0, floor, s.w, 2);
    pets.slice(0, n).forEach((p, i) => {
      p.u = u; p.x = gap * (i + .5); p.y = floor;
      const near = s.pointer.in && Math.abs(s.pointer.x - p.x) < gap / 2;
      p.set(near ? 'wave' : 'sleep');
      p.step(dt); p.draw(x, dt, T, s.dpr);
    });
  });
  stage.onClick = (px, py) => { const p = pets.find(p => p.hit(px, py, 16)); if (p) p.hop(300); };
}

function boot(): void {
  // one section failing must not take the others down
  for (const part of [hero, crew, states, strip, looks, mod, door, privacy, releases, footer, dock]) {
    try { part(); } catch (e) { console.error(`${part.name}:`, e); }
  }
  run();
}
boot();
