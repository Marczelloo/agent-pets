import { pen } from '../renderer';
import { PetPainter } from '../renderer/painter';
import { appFor, defaultPets, defaultStage, lookFor } from '../look';
import { resolveLang, setLang } from '../i18n';
import type { Media, Pets, PointerMsg, Snapshot, StageLayout, StageSettings } from '../types';
import type { Bridge } from './bridge';
import { drawBadge, drawLimits, drawProgress, drawRouterBadge, limitBars } from './hud';
import { geometry, layout, zoomOf, type LayoutOut } from './layout';
import { Orderer } from './order';
import { bgStyle, bgVisible } from './background';
import { Hover } from './hover';
import { passthroughAt } from './hit';
import { Roster, type Entry } from './roster';
import { frameBudget, reducedMotion } from './power';


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
  let media: Media = { playing: false, app: null };
  const music = () => media.playing && pets.react_to_media !== false;
  let stage: StageSettings = defaultStage();
  let orderer = new Orderer(stage.order);
  const bg = document.getElementById('bg');
  let budget = frameBudget(false), saving = false, reduced = reducedMotion();
  const painters = new WeakMap<Entry, PetPainter>();
  const hover = new Hover(bridge, () => ({ out, snap, height: lay.height_css, nowMs: Date.now() + clockOffset, media: music() ? media : null }));
  let through: boolean | null = null;
  const handle: StageHandle = {
    hover: p => {
      hover.pointer(p);
      if (lay.mode !== 'floating' || p.kind !== 'move') return;
      const on = passthroughAt(out, p.x, p.y, lay.height_css, stage.background.kind !== 'none');
      if (on !== through) { through = on; bridge.setPassthrough?.(on); }
    },
  };
  // co sekundę: czas w tooltipie, a przy kolejności „uwaga” przesunięcia po histerezie
  setInterval(() => { if (stage.order === 'attention') relayout(); hover.refresh(); reduced = reducedMotion(); }, 1000);

  const paintBg = () => {
    if (!bg) return;
    Object.assign(bg.style, bgStyle(stage.background, !!lay.light));
    bg.classList.toggle('on', bgVisible(stage.background));
    bg.classList.toggle('floating', lay.mode === 'floating');
  };
  const relayout = () => {
    const now = Date.now() + clockOffset;
    out = layout({
      sessions: snap.sessions, hasLimits: limitBars(snap.limits).length > 0, maxWidth: lay.max_css, maxPets,
      geo: geometry(zoomOf(lay, stage.size), stage.gap, stage.padding),
      order: v => orderer.display(v, now), priority: v => orderer.priority(v, now),
      showBadge: stage.show.badge, showLimits: stage.show.limits,
    });
    roster.sync(snap.sessions, T, music());
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
    const { w, h } = fit();
    x.clearRect(0, 0, w, h);
    const z = out.geo?.zoom ?? h / 48, u = .3 * z, Y = h - 8 * h / 48, hz = h / z;
    for (const p of out.pets) {
      const e = roster.get(p.id);
      if (!e) continue;
      let painter = painters.get(e);
      if (!painter) { painter = new PetPainter(e.pet); painters.set(e, painter); }
      e.pet.alpha = roster.alpha(e, T);
      painter.frame(x, { dt, t0: T + e.phase, X: p.x, Y, u, look: lookFor(pets, appFor(e.session)), animate: budget.animate(e.session.state),
        saving, reduced, dpr: devicePixelRatio || 1 });
      // HUD w skali sceny: rysowany w układzie 1× i powiększony o `z`
      x.save(); x.translate(p.x, h - 4 * h / 48); x.scale(z, z);
      if (stage.show.progress) drawProgress(x, 0, 0, e.session, T, e.scene === 'vibe' ? 'dance' : e.scene === 'doze' ? 'doze' : null);
      x.restore();
      if (e.session.origin === 'router') { x.save(); x.translate(p.x, 8 * h / 48); x.scale(z, z); drawRouterBadge(x, 0, 0); x.restore(); }
    }
    if (out.badgeX != null) { x.save(); x.translate(out.badgeX, 0); x.scale(z, z); drawBadge(x, 0, hz, out.hidden, pen.font); x.restore(); }
    if (out.limitsX != null) { x.save(); x.translate(out.limitsX, 0); x.scale(z, z); drawLimits(x, 0, hz, limitBars(snap.limits)); x.restore(); }
    setTimeout(frame, Math.max(0, 1000 / budget.fps - (performance.now() - now)));
  }

  function kick() {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    setTimeout(frame, 0);
  }

  bridge.onSnapshot(take);
  bridge.onLayout(l => { if (l.mode !== lay.mode) through = null; lay = l; paintBg(); relayout(); });
  bridge.onVisibility(v => { visible = v; if (!v) hover.clear(); kick(); });
  bridge.onPointer(p => handle.hover(p));
  bridge.onSettings(s => {
    setLang(resolveLang(s.language ?? 'auto'));
    pets = s.pets;
    maxPets = s.pets.max_visible;
    const st = s.stage ?? defaultStage();
    if (st.order !== stage.order) orderer = new Orderer(st.order);
    stage = st;
    paintBg();
    relayout();
  });
  bridge.onMoving?.(on => bg?.classList.toggle('moving', on));
  bridge.onPower(s => { saving = s; budget = frameBudget(s); });
  bridge.onMedia?.(m => { const was = music(), app = media.app; media = m; if (music() !== was) relayout(); else if (m.app !== app) hover.refresh(true); });
  void bridge.start().then(s => { if (s) take(s); kick(); });
  return handle;
}
