import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Media, PointerMsg, Settings, State, Tool, SettingsView, Snapshot, StageLayout, TooltipContent } from '../types';
import { demoLimits, demoSessions } from './demo';
import { setSystemLang } from '../i18n';

export interface Bridge {
  /** After registering the listener: signal readiness and return the current snapshot. */
  start(): Promise<Snapshot | null>;
  onSnapshot(cb: (s: Snapshot) => void): void;
  onLayout(cb: (l: StageLayout) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
  onPointer(cb: (p: PointerMsg) => void): void;
  /** Settings (skin, pet limit): current values immediately, then each change. */
  onSettings(cb: (s: Settings) => void): void;
  /** Power saving mode: current value immediately, then each change. */
  onPower(cb: (saving: boolean) => void): void;
  /** System music (Spotify, Apple Music, browser…): current value immediately, then each change. */
  onMedia?(cb: (m: Media) => void): void;
  /** Right-click menu: for a pet (`id`) or general (`null`); x, y in stage CSS pixels. */
  openMenu?(id: string | null, x: number, y: number): void;
  /** Floating window: pass clicks through empty areas. */
  setPassthrough?(on: boolean): void;
  /** Taskbar Move mode: the stage shows a dashed border. */
  onMoving?(cb: (on: boolean) => void): void;
  setWidth(css: number): void;
  /** Visible pets (centers in stage CSS px) for the bubble window. */
  setPets?(pets: { id: string; x: number }[], width: number, zoom: number): void;
  /** `pet`: pet under the cursor; its bubble, if visible, expands instead of a tooltip. */
  showTooltip(anchorX: number, content: TooltipContent, pet?: string): void;
  hideTooltip(): void;
  /** Open the panel (or close it if open); `focus` highlights a session. */
  openPanel(focus?: string): void;
}

export function tauriBridge(): Bridge {
  const subs: Promise<unknown>[] = [];
  const on = <T>(ev: string, cb: (v: T) => void) => { subs.push(listen<T>(ev, e => cb(e.payload))); };
  return {
    async start() {
      await Promise.all(subs);
      await invoke('stage_hello');
      return invoke<Snapshot>('snapshot');
    },
    onSnapshot: cb => on('pets://snapshot', cb),
    onLayout: cb => on('pets://layout', cb),
    onVisibility: cb => on('pets://visibility', cb),
    onPointer: cb => on('pets://pointer', cb),
    onSettings: cb => { on('pets://settings', cb); void invoke<SettingsView>('settings_get').then(v => { setSystemLang(v.system_lang); cb(v.settings); }); },
    onPower: cb => { on<boolean>('pets://power', cb); void invoke<boolean>('power_get').then(cb); },
    onMedia: cb => { on<Media>('pets://media', cb); void invoke<Media>('media_get').then(cb); },
    onMoving: cb => on('pets://moving', cb),
    setPassthrough: on => { void invoke('stage_passthrough', { on }); },
    openMenu: (target, x, y) => { void invoke('stage_menu', { target, x, y }); },
    setWidth: w => { void invoke('stage_set_width', { width: w }); },
    setPets: (pets, width, zoom) => { void invoke('stage_pets', { pets, width, zoom }); },
    showTooltip: (anchorX, content, pet) => { void invoke('tooltip_show', { anchorX, content, pet: pet ?? null }); },
    hideTooltip: () => { void invoke('tooltip_hide'); },
    openPanel: focus => { void invoke('panel_open', { focus: focus ?? null }); },
  };
}

/** Stub for dev.html: demo data, DOM mouse, tooltip in a regular page element. */
export function fakeBridge(canvas: HTMLCanvasElement, tip: HTMLElement,
  opts: { count: () => number; maxWidth: () => number; music?: () => boolean; only?: () => [State, Tool | null] | null; render: (el: HTMLElement, c: TooltipContent) => void }): Bridge {
  const snaps: ((s: Snapshot) => void)[] = [];
  const lays: ((l: StageLayout) => void)[] = [];
  const snap = (): Snapshot => ({ sessions: demoSessions(opts.count(), Date.now(), opts.only?.()), limits: demoLimits(Date.now()), now: Date.now() });
  let lastMax = -1;
  setInterval(() => snaps.forEach(cb => cb(snap())), 1000);
  setInterval(() => {
    const m = opts.maxWidth();
    if (m !== lastMax) { lastMax = m; lays.forEach(cb => cb({ max_css: m, height_css: 48, scale: 1 })); }
  }, 200);
  return {
    async start() { return snap(); },
    onSnapshot: cb => { snaps.push(cb); },
    onLayout: cb => { lays.push(cb); },
    onVisibility: () => {},
    onPointer: cb => {
      canvas.addEventListener('mousemove', e => cb({ kind: 'move', x: e.offsetX, y: e.offsetY }));
      canvas.addEventListener('mouseleave', () => cb({ kind: 'leave' }));
      canvas.addEventListener('click', e => cb({ kind: 'click', x: e.offsetX, y: e.offsetY }));
    },
    onSettings: () => {},
    onPower: () => {},
    onMedia: cb => {
      let last: boolean | null = null;
      setInterval(() => {
        const on = !!opts.music?.();
        if (on !== last) { last = on; cb({ playing: on, app: on ? 'Spotify.exe' : null }); }
      }, 200);
    },
    setWidth: w => { canvas.style.width = `${w}px`; },
    showTooltip: (x, content) => {
      opts.render(tip, content);
      tip.style.left = '0px'; // full width before measuring; as in Rust, keep the tooltip on screen
      const box = canvas.getBoundingClientRect();
      const left = box.left + x - tip.offsetWidth / 2;
      tip.style.left = `${Math.max(4, Math.min(left, innerWidth - tip.offsetWidth - 4))}px`;
      tip.style.top = `${box.top - tip.offsetHeight - 6}px`;
    },
    hideTooltip: () => { tip.hidden = true; },
    openPanel: focus => { console.info('panel_open', focus ?? null); },
  };
}
