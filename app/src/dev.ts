import { setPreviewLang } from './i18n';
import { fakeBridge } from './stage/bridge';

setPreviewLang();
import { startStage } from './stage/stage';
import { renderTooltip } from './tooltip/view';
import type { State, Tool } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const count = $<HTMLInputElement>('count'), width = $<HTMLInputElement>('width'), music = $<HTMLInputElement>('music');
const only = $<HTMLSelectElement>('only'), zoom = $<HTMLInputElement>('zoom'), bar = document.querySelector<HTMLElement>('.taskbar')!;
zoom.oninput = () => { $('zoomOut').textContent = zoom.value; bar.style.transform = `scale(${zoom.value})`; };
const pinned = (): [State, Tool | null] | null => { const [st, tool] = only.value.split(':'); return st ? [st as State, (tool || null) as Tool | null] : null; };
count.oninput = () => { $('countOut').textContent = count.value; };
width.oninput = () => { $('widthOut').textContent = width.value; };

startStage($<HTMLCanvasElement>('stage'), fakeBridge($<HTMLCanvasElement>('stage'), $('tip'),
  { count: () => +count.value, maxWidth: () => +width.value, music: () => music.checked, only: pinned, render: renderTooltip }));
