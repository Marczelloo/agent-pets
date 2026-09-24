import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TooltipContent } from '../types';
import { renderTooltip } from './view';

const box = document.getElementById('tip')!;
void listen<{ seq: number; content: TooltipContent }>('tooltip://content', async e => {
  renderTooltip(box, e.payload.content);
  const r = box.getBoundingClientRect();
  await invoke('tooltip_size', { seq: e.payload.seq, w: Math.ceil(r.width), h: Math.ceil(r.height) });
});
