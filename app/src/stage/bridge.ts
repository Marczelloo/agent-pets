import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PointerMsg, Settings, SettingsView, Snapshot, StageLayout, TooltipContent } from '../types';
import { demoLimits, demoSessions } from './demo';
import { setSystemLang } from '../i18n';

export interface Bridge {
  /** Po zarejestrowaniu nasłuchu: zgłasza gotowość i zwraca bieżącą migawkę. */
  start(): Promise<Snapshot | null>;
  onSnapshot(cb: (s: Snapshot) => void): void;
  onLayout(cb: (l: StageLayout) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
  onPointer(cb: (p: PointerMsg) => void): void;
  /** Ustawienia (skórka, limit zwierzaków): od razu bieżące, potem każda zmiana. */
  onSettings(cb: (s: Settings) => void): void;
  /** Tryb oszczędny: od razu bieżący, potem każda zmiana. */
  onPower(cb: (saving: boolean) => void): void;
  setWidth(css: number): void;
  showTooltip(anchorX: number, content: TooltipContent): void;
  hideTooltip(): void;
  /** Otwiera panel (albo zamyka otwarty); `focus` podświetla sesję. */
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
    onSettings: cb => { on('pets://settings', cb); void invoke<SettingsView>('settings_get').then(v => { setSystemLang(v.lang); cb(v.settings); }); },
    onPower: cb => { on<boolean>('pets://power', cb); void invoke<boolean>('power_get').then(cb); },
    setWidth: w => { void invoke('stage_set_width', { width: w }); },
    showTooltip: (anchorX, content) => { void invoke('tooltip_show', { anchorX, content }); },
    hideTooltip: () => { void invoke('tooltip_hide'); },
    openPanel: focus => { void invoke('panel_open', { focus: focus ?? null }); },
  };
}

/** Atrapa do dev.html: dane pokazowe, mysz z DOM, tooltip w zwykłym elemencie strony. */
export function fakeBridge(canvas: HTMLCanvasElement, tip: HTMLElement,
  opts: { count: () => number; maxWidth: () => number; render: (el: HTMLElement, c: TooltipContent) => void }): Bridge {
  const snaps: ((s: Snapshot) => void)[] = [];
  const lays: ((l: StageLayout) => void)[] = [];
  const snap = (): Snapshot => ({ sessions: demoSessions(opts.count(), Date.now()), limits: demoLimits(Date.now()), now: Date.now() });
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
    setWidth: w => { canvas.style.width = `${w}px`; },
    showTooltip: (x, content) => {
      opts.render(tip, content);
      tip.style.left = '0px'; // pełna szerokość przed pomiarem; jak w Rust, tooltip nie wychodzi poza ekran
      const box = canvas.getBoundingClientRect();
      const left = box.left + x - tip.offsetWidth / 2;
      tip.style.left = `${Math.max(4, Math.min(left, innerWidth - tip.offsetWidth - 4))}px`;
      tip.style.top = `${box.top - tip.offsetHeight - 6}px`;
    },
    hideTooltip: () => { tip.hidden = true; },
    openPanel: focus => { console.info('panel_open', focus ?? null); },
  };
}
