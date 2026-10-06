// The taskbar section: a busy taskbar (bubbles, a subagent, +N, limits) and the statistics podium.
import { Actor, BODY, Stage, bubble, tone } from './engine';
import { badge, drawBar, limitsAt, progress } from './bar';
import type { Agent, State } from '@app/types';

interface Slot { agent: Agent; scene: string; state: State; prog?: [number, number]; idle?: boolean }
const SLOTS: Slot[] = [
  { agent: 'claude', scene: 'edit', state: 'working', prog: [5, 8] },
  { agent: 'codex', scene: 'bash', state: 'working' },
  { agent: 'opencode', scene: 'idle', state: 'idle', idle: true },
  { agent: 'copilot', scene: 'needs', state: 'needs_you' },
  { agent: 'antigravity', scene: 'sleep', state: 'sleep', idle: true },
];

export function strip(): void {
  const pets = SLOTS.map(s => new Actor(s.agent, s.scene));
  const mini = new Actor('claude', 'read');
  let music = false;
  const btn = document.getElementById('music-toggle') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    music = !music;
    btn.setAttribute('aria-pressed', String(music));
    btn.textContent = music ? '■ Stop the music' : '♪ Play some music';
    SLOTS.forEach((s, i) => { if (s.idle) { pets[i].set(music ? (s.state === 'sleep' ? 'doze' : 'vibe') : s.scene); if (music) pets[i].hop(160); } });
  });

  const stage = new Stage(document.querySelector('.strip-stage')!, (s, dt, T) => {
    const x = s.x, barH = 48, barY = s.h - barH - 14;
    // a phone shows the three without wide props; the others fold into "+N"
    const narrow = s.w < 640, order = narrow ? [2, 3, 4] : [0, 1, 2, 3, 4], shown = order.length;
    const u = narrow ? .78 : Math.max(.8, Math.min(1.08, s.w / 1050));
    const gap = 132 * u;
    const tray = drawBar(x, 0, barY, s.w, barH, { limits: limitsAt(T), z: 1.15, icons: narrow ? 2 : 4 });
    // pets sit next to the tray, the "+N" badge before them
    const right = tray - 18 - 40 * u;
    const first = right - gap * (shown - 1);
    badge(x, first - (narrow ? 95 : 150) * u, barY, 1.2, SLOTS.length - shown + 2);
    order.forEach((k, i) => {
      const p = pets[k];
      p.u = u; p.x = first + gap * i; p.y = barY;
      p.step(dt); p.draw(x, dt, T, s.dpr);
      const sl = SLOTS[k], mus = music && sl.idle ? (sl.state === 'sleep' ? 'doze' : 'dance') : null;
      progress(x, p.x, barY + barH - 8, 1.2, { agent: sl.agent, state: sl.state, progress: sl.prog ? { done: sl.prog[0], total: sl.prog[1] } : null }, T, mus);
    });
    // Clawd's subagent, a mini pet beside it
    const z = narrow ? .95 : 1.05;
    if (!narrow) {
      mini.u = u * .55; mini.x = pets[0].x - 88 * u; mini.y = barY;
      mini.step(dt); mini.draw(x, dt, T, s.dpr);
      if (T % 7 < 3.2) bubble(x, pets[0], 'Editing stage.ts', 'action', z, s.dpr, s.w);
    }
    bubble(x, pets[3], 'Allow Bash? npm run deploy', 'question', z, s.dpr, s.w);
  });
  stage.onClick = (px, py) => { const p = pets.find(p => p.hit(px, py, 16)); if (p) p.poke('cheer', 1.4); };

  podium();
}

function podium(): void {
  const steps = [
    { agent: 'codex' as Agent, scene: 'podium_second', h: 62, place: '2', proj: 'agent-router', v: '31 h' },
    { agent: 'claude' as Agent, scene: 'podium_first', h: 92, place: '1', proj: 'agent-pets', v: '58 h' },
    { agent: 'opencode' as Agent, scene: 'podium_third', h: 40, place: '3', proj: 'dotfiles', v: '9 h' },
  ];
  const pets = steps.map(p => new Actor(p.agent, p.scene));
  const stage = new Stage(document.querySelector('.podium-stage')!, (s, dt, T) => {
    const x = s.x, colW = Math.min(130, s.w / 3.3), base = s.h - 36, cx = s.w / 2;
    const u = Math.max(.55, Math.min(.85, colW / 130));
    steps.forEach((st, i) => {
      const X = cx + (i - 1) * colW, top = base - st.h * (s.h / 250);
      x.fillStyle = i === 1 ? tone.clay : tone.bar;
      x.beginPath(); x.roundRect(X - colW / 2 + 3, top, colW - 6, base - top, [10, 10, 0, 0]); x.fill();
      x.fillStyle = i === 1 ? '#1F120C' : tone['bar-ink'];
      x.font = `700 26px Fredoka, ${BODY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(st.place, X, top + Math.min(26, (base - top) / 2));
      x.fillStyle = tone.ink; x.font = `800 12px ${BODY}`; x.textBaseline = 'top';
      x.fillText(st.proj, X, base + 6);
      x.fillStyle = tone['ink-2']; x.font = `500 11px "JetBrains Mono", monospace`;
      x.fillText(st.v, X, base + 21);
      const p = pets[i]; p.u = u; p.x = X; p.y = top;
      p.step(dt); p.draw(x, dt, T, s.dpr);
    });
  });
  stage.onClick = (px, py) => { const p = pets.find(p => p.hit(px, py, 16)); if (p) p.hop(300); };
}
