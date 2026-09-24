import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { PointerMsg, Snapshot, StageLayout, TooltipContent } from '../types';
import { demoLimits, demoSessions } from './demo';

export interface Bridge {
  /** Po zarejestrowaniu nasłuchu: zgłasza gotowość i zwraca bieżącą migawkę. */
  start(): Promise<Snapshot | null>;
  onSnapshot(cb: (s: Snapshot) => void): void;
  onLayout(cb: (l: StageLayout) => void): void;
  onVisibility(cb: (v: boolean) => void): void;
  onPointer(cb: (p: PointerMsg) => void): void;
  setWidth(css: number): void;
  showTooltip(anchorX: number, content: TooltipContent): void;
  hideTooltip(): void;
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
    setWidth: w => { void invoke('stage_set_width', { width: w }); },
    showTooltip: (anchorX, content) => { void invoke('tooltip_show', { anchorX, content }); },
    hideTooltip: () => { void invoke('tooltip_hide'); },
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
    setWidth: w => { canvas.style.width = `${w}px`; },
    showTooltip: (x, content) => {
      opts.render(tip, content);
      const box = canvas.getBoundingClientRect();
      tip.style.left = `${Math.max(4, box.left + x - tip.offsetWidth / 2)}px`;
      tip.style.top = `${box.top - tip.offsetHeight - 6}px`;
    },
    hideTooltip: () => { tip.hidden = true; },
  };
}
