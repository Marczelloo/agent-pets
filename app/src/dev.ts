import { fakeBridge } from './stage/bridge';
import { startStage } from './stage/stage';
import type { TooltipContent } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const count = $<HTMLInputElement>('count'), width = $<HTMLInputElement>('width');
count.oninput = () => { $('countOut').textContent = count.value; };
width.oninput = () => { $('widthOut').textContent = width.value; };

// Podmieniane w tasku 9 na wspólny renderTooltip z src/tooltip/view.ts.
const render = (el: HTMLElement, c: TooltipContent) => { el.textContent = `${c.title} · ${c.lines.join(' · ')}`; el.hidden = false; };

startStage($<HTMLCanvasElement>('stage'), fakeBridge($<HTMLCanvasElement>('stage'), $('tip'),
  { count: () => +count.value, maxWidth: () => +width.value, render }));
