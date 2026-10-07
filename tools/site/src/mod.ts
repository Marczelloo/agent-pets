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

const MAXC = 54, MINC = 30;
const strip = (s: string) => s.replace(/<[^>]*>/g, '');
const row = (s: string, w: number) => `│ ${s}${' '.repeat(Math.max(0, w - 4 - strip(s).length))} │`;
const bar = (pct: number, n = 10) => '█'.repeat(Math.round(pct * n / 100)) + '░'.repeat(n - Math.round(pct * n / 100));
const pc = (n: number) => ` ${String(n).padStart(3)}%`;

// The box for `w` columns; narrower than MAXC it reflows the way a TUI does in a narrow terminal.
function pane(w: number): string {
  const inner = w - 4, nw = w >= MAXC ? 12 : 11;
  const sess = [
    ['c-clay', 'Claude Code', 'refactor stage layout', 'working', 'c-mut'],
    ['c-teal', 'Codex', 'fix flaky tests', 'needs you', 'c-amb'],
    ['c-mut', 'opencode', 'docs pass', 'done', 'c-mut'],
  ];
  const lines = [`╭─ /pets ${'─'.repeat(w - 10)}╮`];
  for (const [dot, a, t, st, sc] of sess) {
    // the title gets what the name and status leave; with under 4 cells it is dropped
    const room = inner - (nw + 3) - 1 - st.length;
    const title = t.length <= room ? t : room >= 4 ? t.slice(0, room - 1).trimEnd() + '…' : '';
    const gap = Math.max(1, inner - (nw + 3) - title.length - st.length);
    lines.push(row(`<b class="${dot}">●</b> ${a.padEnd(nw)} ${title}${' '.repeat(gap)}<span class="${sc}">${st}</span>`, w));
  }
  lines.push(row('', w));
  const lim = (name: string, cls: string, a: number, b: number) => {
    const c = (n: number, n2 = 10) => `<span class="${cls}">${bar(n, n2)}</span>${pc(n)}`;
    if (inner >= 46) return [row(`${name.padEnd(7)} 5h ${c(a)}  wk ${c(b)}`, w)];
    // too narrow for one line: an agent takes two, with the bars shrunk if even that is tight
    const n = Math.min(10, Math.max(4, inner - 15));
    return [row(`${name.padEnd(6)} 5h ${c(a, n)}`, w), row(`${' '.repeat(6)} wk ${c(b, n)}`, w)];
  };
  lines.push(...lim('Claude', 'c-clay', 42, 18), ...lim('Codex', 'c-teal', 61, 27));
  lines.push(`╰${'─'.repeat(w - 2)}╯`);
  return lines.join('\n');
}

export function mod(): void {
  const el = document.querySelector<HTMLElement>('.pane')!, body = el.parentElement!, ctx = document.createElement('canvas').getContext('2d')!;
  let cols = 0;
  // columns that fit .term-body, from the width of one pane character; redraws only when the count changes
  const fit = () => {
    const cs = getComputedStyle(body), f = getComputedStyle(el);
    ctx.font = `${f.fontStyle} ${f.fontWeight} ${f.fontSize} ${f.fontFamily}`;
    const cw = ctx.measureText('─').width, avail = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // 1px spare: layout rounds glyph advances up a little, and a hair over would scroll sideways again
    const c = cw ? Math.min(MAXC, Math.max(MINC, Math.floor((avail - 1) / cw))) : MAXC;
    if (c !== cols) el.innerHTML = pane(cols = c);
  };
  const status = document.querySelector<HTMLElement>('[data-mod-status]')!;
  const typed = document.querySelector<HTMLElement>('[data-typed]')!;
  // on a phone the status line and the prompt wrap; each keeps room for its longest text, so the box never jumps
  let held = 0;
  const hold = () => {
    if (body.clientWidth === held) return;
    held = body.clientWidth;
    for (const [el, texts] of [[status, BEATS.map(b => b.status)], [typed, BEATS.map(b => b.typed)]] as const) {
      const line = el.parentElement!, was = el.textContent;
      line.style.minHeight = '';
      let h = 0;
      for (const t of texts) { el.textContent = t; h = Math.max(h, line.offsetHeight); }
      el.textContent = was; line.style.minHeight = `${h}px`;
    }
  };
  const refit = () => { fit(); hold(); };
  refit();
  new ResizeObserver(refit).observe(body);
  document.fonts?.addEventListener('loadingdone', () => { held = 0; refit(); });
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
