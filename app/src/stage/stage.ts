import { drawPet, pen, stepPet } from '../renderer';
import type { PointerMsg, Snapshot, StageLayout } from '../types';
import type { Bridge } from './bridge';
import { drawBadge, drawLimits, drawProgress, limitBars } from './hud';
import { layout, type LayoutOut } from './layout';
import { Roster } from './roster';

const FPS = 30;

export interface StageHandle { hover: (p: PointerMsg) => void }

export function startStage(canvas: HTMLCanvasElement, bridge: Bridge): StageHandle {
  const x = canvas.getContext('2d')!;
  pen.font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  let snap: Snapshot = { sessions: [], limits: [], now: 0 };
  let lay: StageLayout = { max_css: 0, height_css: 48, scale: 1 };
  let out: LayoutOut = layout({ sessions: [], hasLimits: false, maxWidth: 0 });
  let visible = true, running = false, T = 0, last = performance.now(), sentWidth = -1;
  const roster = new Roster();
  const handle: StageHandle = { hover: () => {} };

  const relayout = () => {
    out = layout({ sessions: snap.sessions, hasLimits: limitBars(snap.limits).length > 0, maxWidth: lay.max_css });
    roster.sync(snap.sessions, T);
    if (out.width !== sentWidth) { sentWidth = out.width; bridge.setWidth(out.width); }
  };

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
      stepPet(e.pet, dt, tt);
      e.pet.alpha = roster.alpha(e, T);
      drawPet(x, e.pet, p.x, Y, u, tt);
      drawProgress(x, p.x, h - 4, e.session, T);
    }
    if (out.badgeX != null) drawBadge(x, out.badgeX, h, out.hidden, pen.font);
    if (out.limitsX != null) drawLimits(x, out.limitsX, h, limitBars(snap.limits));
    setTimeout(frame, Math.max(0, 1000 / FPS - (performance.now() - now)));
  }

  function kick() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    setTimeout(frame, 0);
  }

  bridge.onSnapshot(s => { snap = s; relayout(); });
  bridge.onLayout(l => { lay = l; relayout(); });
  bridge.onVisibility(v => { visible = v; kick(); });
  bridge.onPointer(p => handle.hover(p));
  void bridge.start().then(s => { if (s) { snap = s; relayout(); } kick(); });
  return handle;
}
