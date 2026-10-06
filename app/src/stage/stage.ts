import { pen } from '../renderer';
import { PetPainter } from '../renderer/painter';
import { appFor, defaultPets, defaultStage, lookFor } from '../look';
import { resolveLang, setLang } from '../i18n';
import type { Media, Pets, PointerMsg, Snapshot, StageLayout, StageSettings } from '../types';
import type { Bridge } from './bridge';
import { drawBadge, drawLimits, drawMiniMore, drawProgress, drawRouterBadge, limitBars } from './hud';
import { MINI_SCALE, miniAlpha, miniScene, minisLeftOf, minisOf, parentScene } from './minis';
import { routerHealth } from './router';
import { drawSpawn, SPAWN_S } from './spawn';
import { STYLES } from '../styles';
import { accentFor } from './sceneFor';
import { effectiveStyle } from '../renderer/effective';
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
  let visible = true, running = false, T = 0, last = performance.now(), sentWidth = -1, sentPets = '';
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
  /** when (T) a child first appeared as a mini: for the entrance effect */
  const miniBorn = new Map<string, number>();
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
  // every second: time in the tooltip and, for attention order, movement after hysteresis
  // (a mini pet appears after the child has worked for 5 s, even without new events)
  setInterval(() => { if (stage.order === 'attention' || snap.sessions.some(s => s.parent)) relayout(); hover.refresh(); reduced = reducedMotion(); }, 1000);

  const paintBg = () => {
    if (!bg) return;
    Object.assign(bg.style, bgStyle(stage.background, !!lay.light));
    bg.classList.toggle('on', bgVisible(stage.background));
    bg.classList.toggle('floating', lay.mode === 'floating');
  };
  const relayout = () => {
    const now = Date.now() + clockOffset, on = stage.minis ?? true;
    out = layout({
      sessions: snap.sessions, hasLimits: limitBars(snap.limits).length > 0, maxWidth: lay.max_css, maxPets,
      geo: geometry(zoomOf(lay, stage.size), stage.gap, stage.padding),
      order: v => orderer.display(v, now), priority: v => orderer.priority(v, now),
      showBadge: stage.show.badge, showLimits: stage.show.limits,
      minis: p => minisOf(p, snap.sessions, now, on), minisLeft: minisLeftOf(stage),
    });
    // a parent with a young child (no mini) delegates; minis say goodbye separately; an idle parent listens to music
    roster.sync(snap.sessions, T, s => s.parent ? miniScene(s, now) : parentScene(s, snap.sessions, now, on, music()));
    const shownMinis = new Set(out.pets.flatMap(p => p.minis.map(m => m.id)));
    for (const id of shownMinis) if (!miniBorn.has(id)) miniBorn.set(id, T);
    for (const id of [...miniBorn.keys()]) if (!shownMinis.has(id)) miniBorn.delete(id);
    if (out.width !== sentWidth) { sentWidth = out.width; bridge.setWidth(out.width); }
    const at = out.pets.map(p => ({ id: p.id, x: Math.round(p.x) })), zoom = out.geo?.zoom ?? 1;
    const key = JSON.stringify([at, out.width, zoom]);
    if (key !== sentPets) { sentPets = key; bridge.setPets?.(at, out.width, zoom); }
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
    // power saving runs at 10 fps: a real 0.1 s frame must advance the clock by 0.1 s (substepped in tick), not by the 0.05 s hitch cap
    const dt = Math.min(budget.fps < 30 ? .25 : .05, (now - last) / 1000);
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
      // HUD in stage scale: drawn at 1× and enlarged by `z`
      x.save(); x.translate(p.x, h - 4 * h / 48); x.scale(z, z);
      if (stage.show.progress) drawProgress(x, 0, 0, e.session, T, e.scene === 'vibe' ? 'dance' : e.scene === 'doze' ? 'doze' : null);
      x.restore();
      if (e.session.origin === 'router') { x.save(); x.translate(p.x, 8 * h / 48); x.scale(z, z); drawRouterBadge(x, 0, 0); x.restore(); }
      drawMinis(p, z, u, Y, h, dt);
    }
    if (out.badgeX != null) { x.save(); x.translate(out.badgeX, 0); x.scale(z, z); drawBadge(x, 0, hz, out.hidden, pen.font); x.restore(); }
    if (out.limitsX != null) { x.save(); x.translate(out.limitsX, 0); x.scale(z, z); drawLimits(x, 0, hz, limitBars(snap.limits)); x.restore(); }
    setTimeout(frame, Math.max(0, 1000 / budget.fps - (performance.now() - now)));
  }

  /** Parent's mini pets: child agent skin and style, 55% size, entrance effect, and quick farewell. */
  function drawMinis(p: LayoutOut['pets'][number], z: number, u: number, Y: number, h: number, dt: number) {
    const nowMs = Date.now() + clockOffset, mu = u * MINI_SCALE;
    for (const m of p.minis) {
      const e = roster.get(m.id);
      if (!e) continue;
      let painter = painters.get(e);
      if (!painter) { painter = new PetPainter(e.pet); painters.set(e, painter); }
      const look = lookFor(pets, appFor(e.session)), born = miniBorn.get(m.id) ?? T, k = (T - born) / SPAWN_S;
      e.pet.alpha = Math.min(1, Math.max(0, k)) * miniAlpha(e.session, nowMs);
      painter.frame(x, { dt, t0: T + e.phase, X: m.x, Y, u: mu, look, animate: budget.animate(e.session.state), saving, reduced, dpr: devicePixelRatio || 1 });
      if (k < 1 && !reduced) {
        drawSpawn(x, m.x, Y, mu, Math.max(0, k), look.motion, STYLES[effectiveStyle(look.style, e.pet.type)]?.model === 'pixel', devicePixelRatio || 1,
          accentFor(e.session));
      }
      const rt = e.session.router_task;
      if (e.session.sub?.kind === 'router' || rt) {
        const hl = rt ? routerHealth(rt, nowMs, e.session.last_activity) : 'active';
        x.save(); x.translate(m.x, 14 * h / 48); x.scale(z * MINI_SCALE, z * MINI_SCALE);
        drawRouterBadge(x, 0, 0, hl === 'stalled' || hl === 'blocked'); x.restore();
      }
    }
    if (p.miniMore) { x.save(); x.translate(p.miniMore.x, 0); x.scale(z, z); drawMiniMore(x, 0, h / z, p.miniMore.n, pen.font); x.restore(); }
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
