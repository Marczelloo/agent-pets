import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Snapshot } from './types';

const info = document.getElementById('info')!;
const show = (s: Snapshot) => { info.textContent = `Agent Pets: ${s.sessions.length} sesji, ${s.limits.length} limitów`; };
void listen<Snapshot>('pets://snapshot', e => show(e.payload)).then(() => invoke<Snapshot>('snapshot').then(show));
void invoke('stage_hello');
void invoke('stage_set_width', { width: 220 });
