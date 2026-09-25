import { drawPet, pen, stepPet } from '../renderer';
import { appFor, defaultPets, lookFor } from '../look';
import type { Pets, PointerMsg, Snapshot, StageLayout } from '../types';
import type { Bridge } from './bridge';
import { drawBadge, drawLimits, drawProgress, drawRouterBadge, limitBars } from './hud';
import { layout, type LayoutOut } from './layout';
import { Hover } from './hover';
import { Roster } from './roster';
import { frameBudget } from './power';


export interface StageHandle { hover: (p: PointerMsg) => void }

export function startStage(canvas: HTMLCanvasElement, bridge: Bridge): StageHandle {
  const x = canvas.getContext('2d')!;
  pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  let snap: Snapshot = { sessions: [], limits: [], now: 0 };
  let lay: StageLayout = { max_css: 0, height_css: 48, scale: 1 };
  let out: LayoutOut = layout({ sessions: [], hasLimits: false, maxWidth: 0 });
  let visible = true, running = false, T = 0, last = performance.now(), sentWidth = -1;
  const roster = new Roster();
  let clockOffset = 0;
  let maxPets: number | undefined;
  let pets: Pets = defaultPets();
  let budget = frameBudget(false);
  const hover = new Hover(bridge, () => ({ out, snap, height: lay.height_css, nowMs: Date.now() + clockOffset }));
  const handle: StageHandle = { hover: p => hover.pointer(p) };
  setInterval(() => hover.refresh(), 1000);

  const relayout = () => {
    out = layout({ sessions: snap.sessions, hasLimits: limitBars(snap.limits).length > 0, maxWidth: lay.max_css, maxPets });
    roster.sync(snap.sessions, T);
    if (out.width !== sentWidth) { sentWidth = out.width; bridge.setWidth(out.width); }
    hover.refresh(true);
  };
  const take = (s: Snapshot) => { snap = s; clockOffset = s.now - Date.now(); relayout(); };

  function fit() {
    const d = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    const pw = Math.round(w * d), ph = Math.round(h * d);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    x.setTransform(d, 0, 0, d, 0, 0);
    return { w, h };
  }

  function frame() {
    if (!visible) { running = false; return; }
    const now = performance.now();
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    T += dt;
    pen.boil = Math.floor(T * 8);
    const { w, h } = fit();
    x.clearRect(0, 0, w, h);
    const u = .3 * h / 48, Y = h - 8;
    for (const p of out.pets) {
      const e = roster.get(p.id);
      if (!e) continue;
      const tt = T + e.phase;
      if (budget.animate(e.session.state)) stepPet(e.pet, dt, tt);
      e.pet.alpha = roster.alpha(e, T);
      drawPet(x, e.pet, p.x, Y, u, tt, lookFor(pets, appFor(e.session)));
      drawProgress(x, p.x, h - 4, e.session, T);
      if (e.session.origin === 'router') drawRouterBadge(x, p.x, 8);
    }
    if (out.badgeX != null) drawBadge(x, out.badgeX, h, out.hidden, pen.font);
    if (out.limitsX != null) drawLimits(x, out.limitsX, h, limitBars(snap.limits));
    setTimeout(frame, Math.max(0, 1000 / budget.fps - (performance.now() - now)));
  }

  function kick() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    setTimeout(frame, 0);
  }

  bridge.onSnapshot(take);
  bridge.onLayout(l => { lay = l; relayout(); });
  bridge.onVisibility(v => { visible = v; if (!v) hover.clear(); kick(); });
  bridge.onPointer(p => handle.hover(p));
  bridge.onSettings(s => { pets = s.pets; maxPets = s.pets.max_visible; relayout(); });
  bridge.onPower(saving => { budget = frameBudget(saving); });
  void bridge.start().then(s => { if (s) take(s); kick(); });
  return handle;
}
