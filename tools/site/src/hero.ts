// The wordmark with the whole crew perched on its letters: they drop in one by one, then keep an eye on your cursor.
import { Actor, REDUCED, Stage, bubble, type Who, crewOf } from './engine';

type Perch = { who: Who; letter: number; scene: string; nudge?: number };
// A g e n t   P e t s
const PERCHES: Perch[] = [
  { who: 'grok', letter: 0, scene: 'wave' },
  { who: 'zcode', letter: 1, scene: 'vibe' },
  { who: 'cursor', letter: 2, scene: 'clap' },
  { who: 'kodek', letter: 3, scene: 'perch' },
  { who: 'blob', letter: 4, scene: 'perch' },
  { who: 'clawd', letter: 5, scene: 'perch', nudge: -.12 },
  { who: 'copilot', letter: 6, scene: 'web' },
  { who: 'android', letter: 7, scene: 'done' },
  { who: 'opencode', letter: 8, scene: 'thinking' },
];
const POKES = ['cheer', 'done', 'clap', 'wave'];

export function hero(): void {
  const root = document.querySelector<HTMLElement>('.hero')!;
  const h1 = root.querySelector<HTMLElement>('.mark')!;
  // one span per letter, for the entrance and to find where each pet sits
  let i = 0;
  h1.querySelectorAll<HTMLElement>('.w').forEach(w => {
    w.innerHTML = [...w.textContent!].map(ch => `<span class="l" style="--i:${i++}">${ch}</span>`).join('');
  });
  const letters = [...h1.querySelectorAll<HTMLElement>('.l')];
  const actors = PERCHES.map(p => { const c = crewOf(p.who); return new Actor(c.agent, p.scene, c.name ?? null); });
  const meas = document.createElement('canvas').getContext('2d')!;
  let ready = false, t0 = 0, pointerX = -1;
  const clawd = actors[5];

  const place = (s: Stage) => {
    const cr = s.canvas.getBoundingClientRect();
    const cs = getComputedStyle(h1), size = parseFloat(cs.fontSize);
    meas.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    const u = Math.max(.4, Math.min(1.05, size / 225));
    PERCHES.forEach((p, k) => {
      // offsets, not the client rect: the letters' entrance transform must not move the pets
      const el = letters[p.letter], hr = h1.getBoundingClientRect();
      const r = { left: hr.left + el.offsetLeft, top: hr.top + el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      // the baseline: the bottom of the zero-height marker that sits on it, shifted by this letter's line
      const m = meas.measureText(el.textContent!);
      const base = r.top + (r.height + m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
      const a = actors[k];
      a.u = u;
      a.x = r.left - cr.left + r.width * (.5 + (p.nudge ?? 0));
      a.y = base - m.actualBoundingBoxAscent - cr.top + 2 * u;
    });
  };

  const stage = new Stage(root.querySelector('.hero-stage')!, (s, dt, T) => {
    if (!ready) return;
    if (!t0) t0 = T;
    const since = T - t0;
    actors.forEach((a, k) => {
      const at = .55 + k * .11;
      if (a.hidden && (since > at || REDUCED)) { a.hidden = false; a.drop(320 + k * 12); }
      a.pet.gaze = pointerX < 0 ? 0 : Math.max(-1, Math.min(1, (pointerX - a.x) / 380));
      a.step(dt);
      a.draw(s.x, dt, T, s.dpr);
    });
    if (since > 2.4 && since < 9 && !clawd.hidden) bubble(s.x, clawd, 'Hi! Follow me down the taskbar', 'action', Math.max(.9, clawd.u), s.dpr, s.w);
  }, { interactive: false });
  actors.forEach(a => { a.hidden = true; });

  stage.onResize = () => { if (ready) place(stage); };
  window.addEventListener('pointermove', e => { const r = stage.canvas.getBoundingClientRect(); pointerX = e.clientY < r.bottom ? e.clientX - r.left : -1; }, { passive: true });
  // the canvas lets clicks through to the links; pets are found by position
  root.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    const r = stage.canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    const a = actors.find(a => !a.hidden && a.hit(px, py, 14));
    if (a) a.poke(POKES[Math.floor(Math.random() * POKES.length)], 1.8);
  });
  root.addEventListener('pointermove', e => {
    const r = stage.canvas.getBoundingClientRect();
    root.style.cursor = actors.some(a => !a.hidden && a.hit(e.clientX - r.left, e.clientY - r.top, 14)) && !(e.target as HTMLElement).closest('a, button') ? 'pointer' : '';
  });

  // pets sit on the letters as the font draws them, so wait for it
  const go = () => { place(stage); ready = true; };
  (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(go));
  window.addEventListener('resize', () => { if (ready) place(stage); });
}
