import type { TooltipContent } from '../types';

/** Tytuły sesji to treść promptów: wyłącznie `textContent`, nigdy `innerHTML`. */
export function renderTooltip(el: HTMLElement, c: TooltipContent): void {
  const row = (cls: string, text: string) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text;
    return d;
  };
  el.replaceChildren(row('title', c.title), ...(c.subtitle ? [row('sub', c.subtitle)] : []), ...c.lines.map(l => row('line', l)));
  el.hidden = false;
}
