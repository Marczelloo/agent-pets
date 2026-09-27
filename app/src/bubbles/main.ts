// Okno dymków (spec 0.8, 2.3): wybór (`Picker`), rozmieszczenie (`arrange`), rysowanie (`drawBubble`) i animacja.
// Okno stoi nad sceną; Rust ustawia je na prośbę (`bubbles_place`) i obsługuje kliknięcia w dymki.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { resolveLang, setLang, setSystemLang } from '../i18n';
import { appFor, defaultPets, defaultStage, lookFor } from '../look';
import { drawBubble, measureBubble, type BubbleBox } from '../renderer/bubble';
import { reducedMotion } from '../stage/power';
import { blockContextMenu } from '../stage/nocontext';
import { ACCENT } from '../styles';
import { accentFor } from '../stage/sceneFor';
import type { Pets, Session, Settings, SettingsView, Snapshot, StageSettings } from '../types';
import { arrange } from './arrange';
import { Picker, type BubbleWant } from './pick';

/** Zapas po bokach sceny w oknie dymków (px CSS), jak `bubbles::MARGIN_CSS` w Rust. */
const MARGIN = 150;
const POP_MS = 150, FADE_MS = 200, ROW_GAP = 4;

/** `wide`: rozwinięty po najechaniu na zwierzaka (pełny tekst w kilku liniach). */
interface Live { want: BubbleWant; box: BubbleBox; born: number; gone: number | null; wide: boolean }
interface StagePets { pets: { id: string; x: number }[]; width: number; zoom: number }

const canvas = document.getElementById('bubbles') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
blockContextMenu(window);

let snap: Snapshot = { sessions: [], limits: [], now: 0 };
let pets: Pets = defaultPets();
let stage: StageSettings = defaultStage();
let at: StagePets = { pets: [], width: 0, zoom: 1 };
let visible = true, moving = false, raf = 0, lastHits = '';
/** zwierzak pod kursorem, którego dymek jest rozwinięty (od Rust, zamiast tooltipa) */
let hovered: string | null = null;
const picker = new Picker();
const live = new Map<string, Live>();

const lookOf = (s: Session) => lookFor(pets, appFor(s));
const accentOf = (id: string) => { const s = snap.sessions.find(x => x.id === id); return s ? accentFor(s) : ACCENT.clawd; };
const keyOf = (w: BubbleWant) => `${w.id}|${w.kind}|${w.text}`;

/** Nowy stan: które dymki mają być, które wchodzą, a które znikają. */
function refresh(): void {
  const now = Date.now();
  const on = visible && !moving && at.pets.length > 0;
  const wants = on ? picker.update(snap, at.pets, lookOf, stage.bubbles, now) : [];
  const keys = new Set(wants.map(keyOf));
  for (const w of wants) {
    const k = keyOf(w), l = live.get(k), wide = hovered === w.id && w.full !== w.text;
    const box = () => measureBubble(ctx, wide ? w.full : w.text, w.look, at.zoom, devicePixelRatio || 1, wide);
    if (l) { if (l.wide !== wide) { l.wide = wide; l.box = box(); } l.want = w; l.gone = null; }
    else live.set(k, { want: w, box: box(), born: now, gone: null, wide });
  }
  for (const [k, l] of live) if (!keys.has(k) && l.gone == null) l.gone = on ? now : now - FADE_MS;
  void paint();
}

async function paint(): Promise<void> {
  const now = Date.now();
  for (const [k, l] of live) if (l.gone != null && now - l.gone >= FADE_MS) live.delete(k);
  if (live.size === 0) {
    lastHits = '';
    await invoke('bubbles_hide');
    return;
  }
  const list = [...live.values()];
  const rowH = Math.max(...list.map(l => l.box.h));
  const W = Math.ceil(at.width + 2 * MARGIN), H = Math.ceil(2 * rowH + ROW_GAP);
  const placed = await invoke<{ offset: number; above: boolean } | null>('bubbles_place', { w: W, h: H });
  // scena schowana albo gra na pełnym ekranie: Rust już schował okno; stan wraca przy następnym odświeżeniu
  if (!placed) { lastHits = ''; return; }
  const d = devicePixelRatio || 1;
  const pw = Math.round(W * d), ph = Math.round(H * d);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const pos = arrange(list.map(l => ({ x: l.want.x + placed.offset, w: l.box.w })), W);
  const reduced = reducedMotion();
  const hits: { id: string; kind: string; x: number; y: number; w: number; h: number }[] = [];
  let busy = false;
  list.forEach((l, i) => {
    const { left, row } = pos[i];
    // nad sceną rząd 0 jest na dole (przy zwierzakach); pod sceną na górze
    const y = placed.above ? H - l.box.h - row * (rowH + ROW_GAP) : row * (rowH + ROW_GAP);
    const tail = l.want.x + placed.offset - left;
    const tIn = Math.min(1, (now - l.born) / POP_MS), tOut = l.gone == null ? 0 : Math.min(1, (now - l.gone) / FADE_MS);
    busy ||= tIn < 1 || l.gone != null;
    ctx.save();
    ctx.globalAlpha = tIn * (1 - tOut);
    if (!reduced && tIn < 1) {
      // wskakuje od ogonka: skala 0,8 → 1 (w „Ograniczeniu ruchu” tylko się przenika)
      const s = 0.8 + 0.2 * tIn, ox = left + tail, oy = y + l.box.h;
      ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(-ox, -oy);
    }
    drawBubble(ctx, left, y, l.wide ? l.want.full : l.want.text, l.want.kind, l.want.look, tail, at.zoom, d, accentOf(l.want.id), l.wide);
    ctx.restore();
    if (l.gone == null) hits.push({ id: l.want.id, kind: l.want.kind, x: left, y, w: l.box.w, h: l.box.h });
  });
  const h = JSON.stringify(hits);
  if (h !== lastHits) { lastHits = h; void invoke('bubbles_hits', { hits }); }
  if (busy && !raf) raf = requestAnimationFrame(() => { raf = 0; void paint(); });
}

void listen<Snapshot>('pets://snapshot', e => { snap = e.payload; refresh(); });
void listen<StagePets>('pets://stage-pets', e => { at = e.payload; refresh(); });
void listen<boolean>('pets://visibility', e => { visible = e.payload; refresh(); });
void listen<boolean>('pets://moving', e => { moving = e.payload; refresh(); });
void listen<string | null>('pets://hover', e => { if (hovered !== e.payload) { hovered = e.payload; refresh(); } });
const onSettings = (s: Settings) => { setLang(resolveLang(s.language ?? 'auto')); pets = s.pets; stage = s.stage ?? defaultStage(); refresh(); };
void listen<Settings>('pets://settings', e => onSettings(e.payload));
void invoke<SettingsView>('settings_get').then(v => { setSystemLang(v.system_lang); onSettings(v.settings); });
void invoke<Snapshot>('snapshot').then(s => { snap = s; refresh(); });
// dymek akcji gaśnie po 3 s bez nowych zdarzeń
setInterval(refresh, 500);
