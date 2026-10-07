// The dock: the page's navigation is a taskbar, and a guide pet pops up above the section you are reading.
import { drawLimits, limitBars } from '@app/stage/hud';
import { Actor, REDUCED, Stage, bubble, crewOf, type Who } from './engine';
import { limitsAt } from './bar';
import type { Look, StyleId } from '@app/types';

interface Guide { who: Who; scene: string; style: StyleId; say: string }
const GUIDES: Record<string, Guide> = {
  top: { who: 'kodek', scene: 'idle', style: 'sticker', say: 'Psst. This taskbar is the menu' },
  crew: { who: 'clawd', scene: 'wave', style: 'sticker', say: 'Meet the crew!' },
  states: { who: 'kodek', scene: 'thinking', style: 'sketch', say: 'Pick a state, any state' },
  taskbar: { who: 'copilot', scene: 'web', style: 'neon', say: 'This is where we live' },
  looks: { who: 'zcode', scene: 'vibe', style: 'pastel', say: 'Sweep across the stripes' },
  mod: { who: 'clawd', scene: 'bash', style: 'pixel', say: 'I live in your terminal too' },
  door: { who: 'blob', scene: 'needs', style: 'ink', say: "What's your agent called?" },
  privacy: { who: 'opencode', scene: 'read', style: 'clean', say: 'Shh. It all stays local' },
  releases: { who: 'android', scene: 'cheer', style: 'clean', say: 'Fresh release!' },
  install: { who: 'grok', scene: 'point', style: 'sketch', say: 'Three steps. Go!' },
};

export function dock(): void {
  const links = new Map([...document.querySelectorAll<HTMLAnchorElement>('[data-nav]')].map(a => [a.dataset.nav!, a]));
  const start = document.querySelector<HTMLElement>('.taskbar .start')!;
  const bar = document.querySelector<HTMLElement>('.taskbar')!;
  let current = '', guide: Actor | null = null, leaving: Actor | null = null, said = 0, text = '';

  const anchorX = (key: string, s: Stage) => {
    const el = links.get(key) ?? start;
    const r = el.getBoundingClientRect(), cr = s.canvas.getBoundingClientRect();
    return Math.max(30, Math.min(s.w - 30, r.left + r.width / 2 - cr.left));
  };

  const show = (key: string) => {
    if (key === current) return;
    current = key;
    links.forEach((a, k) => a.setAttribute('aria-current', String(k === key)));
    // keep the current icon in view on a phone, where the icons scroll (never scrolls the page itself)
    const link = links.get(key), apps = link?.parentElement;
    if (link && apps && apps.scrollWidth > apps.clientWidth) {
      const l = link.offsetLeft - apps.offsetLeft, r = l + link.offsetWidth;
      if (l < apps.scrollLeft || r > apps.scrollLeft + apps.clientWidth) apps.scrollTo({ left: l - apps.clientWidth / 2 + link.offsetWidth / 2, behavior: REDUCED ? 'auto' : 'smooth' });
    }
    const g = GUIDES[key] ?? GUIDES.top, c = crewOf(g.who);
    if (guide) { leaving = guide; leaving.vy = -260; }
    guide = new Actor(c.agent, g.scene, c.name ?? null);
    guide.look = { style: g.style, motion: 'calm' } as Look;
    guide.dy = 70; guide.vy = REDUCED ? 0 : -820;
    if (REDUCED) guide.dy = 0;
    (guide as Actor & { key: string }).key = key;
    text = g.say; said = 0;
  };

  const stage = new Stage(document.querySelector('.dock-stage')!, (s, dt, T) => {
    const x = s.x, top = bar.getBoundingClientRect().top - s.canvas.getBoundingClientRect().top;
    const narrow = s.w < 560, u = narrow ? .48 : .6;
    if (leaving) {
      // the old guide hops and sinks behind the bar
      leaving.vy += 2200 * dt; leaving.dy += leaving.vy * dt; leaving.alpha = Math.max(0, 1 - leaving.dy / 80);
      leaving.u = u; leaving.y = top; leaving.draw(x, dt, T, s.dpr);
      if (leaving.dy > 90) leaving = null;
    }
    if (guide) {
      const key = (guide as Actor & { key: string }).key;
      guide.u = u; guide.y = top;
      guide.x += (anchorX(key, s) - guide.x) * (guide.x ? Math.min(1, dt * 10) : 1);
      guide.step(dt); guide.draw(x, dt, T, s.dpr);
      said += dt;
      // on a phone the first screen's bubble would cover the download button, and the hero has its own
      if (said > .5 && said < 5.5 && !(narrow && key === 'top')) bubble(x, guide, text, 'action', narrow ? .9 : 1, s.dpr, s.w, guide.look, 6);
    }
  }, { always: true, interactive: false });

  // the guide sits on top of the bar; find it by position
  window.addEventListener('click', e => {
    if (!guide || (e.target as HTMLElement).closest('a, button, input')) return;
    const r = stage.canvas.getBoundingClientRect();
    if (guide.hit(e.clientX - r.left, e.clientY - r.top, 10)) { guide.poke('cheer', 1.4); said = 0; }
  });

  // The section that fills most of the window wins, so the guide never runs ahead to a section that only just
  // peeks in (a tall 2K window shows a lot of two sections at once). A newcomer must lead by a margin, so it
  // doesn't flicker at the border. Measured by hand on scroll, not with an IntersectionObserver, whose rootMargin
  // a cross-origin iframe (a preview) may ignore.
  const hero = document.querySelector<HTMLElement>('.hero')!;
  const secs: [HTMLElement, string][] = [[hero, 'top'], ...[...document.querySelectorAll<HTMLElement>('[data-guide]')].map(e => [e, e.dataset.guide!] as [HTMLElement, string])];
  let queued = false;
  const pick = () => {
    queued = false;
    const vh = window.innerHeight - bar.offsetHeight;
    const seen = secs.map(([e, key]) => { const r = e.getBoundingClientRect(); return { key, px: Math.max(0, Math.min(vh, r.bottom) - Math.max(0, r.top)) }; });
    const best = seen.reduce((a, b) => (b.px > a.px ? b : a));
    const now = seen.find(v => v.key === current)?.px ?? 0;
    if (best.px > 0 && (best.key === current || best.px > now + vh * .08 || now === 0)) show(best.key);
  };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(pick); } };
  window.addEventListener('scroll', later, { passive: true });
  window.addEventListener('resize', later);
  pick();

  startMenu(links);

  tray();
}

/** The Start button opens a Start menu: every section with its name, the downloads and the links. */
function startMenu(links: Map<string, HTMLAnchorElement>): void {
  const btn = document.querySelector<HTMLButtonElement>('.taskbar .start')!;
  const menu = document.getElementById('start-menu')!;
  const pinned = menu.querySelector<HTMLElement>('.sm-pinned')!;
  pinned.innerHTML = [...links.values()].map(a =>
    `<a href="${a.getAttribute('href')}" style="${a.getAttribute('style')}">${a.querySelector('i')!.outerHTML}<span>${a.querySelector('span')!.textContent}</span></a>`).join('');
  const open = (on: boolean) => {
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    if (on) (menu.querySelector('a') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  btn.addEventListener('click', e => { e.stopPropagation(); open(!!menu.hidden); });
  menu.addEventListener('click', e => { if ((e.target as HTMLElement).closest('a')) open(false); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target as Node)) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { open(false); btn.focus(); } });
}

function tray(): void {
  const clock = document.querySelector<HTMLElement>('[data-clock]')!;
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 10_000);
  new Stage(document.querySelector('.tray-limits')!, (s, _dt, T) => {
    const z = s.h / 48;
    s.x.save(); s.x.scale(z, z); drawLimits(s.x, 0, 48, limitBars(limitsAt(T))); s.x.restore();
  }, { always: true, interactive: false });
}

