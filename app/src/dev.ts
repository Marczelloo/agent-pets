import { fakeBridge } from './stage/bridge';
import { startStage } from './stage/stage';
import { renderTooltip } from './tooltip/view';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const count = $<HTMLInputElement>('count'), width = $<HTMLInputElement>('width');
count.oninput = () => { $('countOut').textContent = count.value; };
width.oninput = () => { $('widthOut').textContent = width.value; };

startStage($<HTMLCanvasElement>('stage'), fakeBridge($<HTMLCanvasElement>('stage'), $('tip'),
  { count: () => +count.value, maxWidth: () => +width.value, render: renderTooltip }));
