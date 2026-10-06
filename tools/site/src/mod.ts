// The Claude Code mod: a terminal with the /pets pane and a pixel Clawd above the prompt.
import { Actor, REDUCED, Stage } from './engine';

const BEATS: { scene: string; status: string; typed: string }[] = [
  { scene: 'thinking', status: 'thinking', typed: 'why does the stage drop frames on battery?' },
  { scene: 'read', status: 'reading power.ts', typed: '' },
  { scene: 'edit', status: 'editing power.ts', typed: '' },
  { scene: 'bash', status: 'running pnpm test', typed: '' },
  { scene: 'done', status: 'done · 2m 14s · 41k tokens', typed: '/pets' },
  { scene: 'idle', status: 'idle', typed: '' },
];

const W = 54;
const row = (s: string, vis: number) => `│ ${s}${' '.repeat(Math.max(0, W - 4 - vis))} │`;
const bar = (pct: number) => '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10));

function pane(): string {
  const sess = [
    ['c-clay', 'Claude Code', 'refactor stage layout', 'working', 'c-mut'],
    ['c-teal', 'Codex', 'fix flaky tests', 'needs you', 'c-amb'],
    ['c-mut', 'opencode', 'docs pass', 'done', 'c-mut'],
  ];
  const lines = [`╭─ /pets ${'─'.repeat(W - 10)}╮`];
  for (const [dot, a, t, st, sc] of sess) {
    const left = `● ${a.padEnd(12)} ${t}`, gap = Math.max(1, W - 4 - left.length - st.length);
    lines.push(row(`<b class="${dot}">●</b> ${a.padEnd(12)} ${t}${' '.repeat(gap)}<span class="${sc}">${st}</span>`, W - 4));
  }
  lines.push(row('', 0));
  const lim = (name: string, cls: string, a: number, b: number) => {
    const text = `${name.padEnd(7)} 5h ${bar(a)} ${String(a).padStart(3)}%  wk ${bar(b)} ${String(b).padStart(3)}%`;
    return row(`${name.padEnd(7)} 5h <span class="${cls}">${bar(a)}</span> ${String(a).padStart(3)}%  wk <span class="${cls}">${bar(b)}</span> ${String(b).padStart(3)}%`, text.length);
  };
  lines.push(lim('Claude', 'c-clay', 42, 18), lim('Codex', 'c-teal', 61, 27));
  lines.push(`╰${'─'.repeat(W - 2)}╯`);
  return lines.join('\n');
}

export function mod(): void {
  document.querySelector('.pane')!.innerHTML = pane();
  const status = document.querySelector<HTMLElement>('[data-mod-status]')!;
  const typed = document.querySelector<HTMLElement>('[data-typed]')!;
  const clawd = new Actor('claude', 'thinking');
  clawd.look = { style: 'pixel', motion: 'calm' };
  let beat = -1, t = 0;
  const next = () => {
    beat = (beat + 1) % BEATS.length; t = 0;
    const b = BEATS[beat];
    clawd.set(b.scene); status.textContent = b.status;
    if (b.scene === 'done') clawd.hop(160);
  };
  next();
  new Stage(document.querySelector('.term-pet')!, (s, dt, T) => {
    t += dt;
    if (t > 3) next();
    // the prompt types itself, then clears when the turn starts
    const b = BEATS[beat];
    typed.textContent = REDUCED ? b.typed : b.typed.slice(0, Math.floor(t * 28));
    clawd.u = .62; clawd.x = 36; clawd.y = s.h - 6;
    clawd.step(dt); clawd.draw(s.x, dt, T, s.dpr);
  });
}
