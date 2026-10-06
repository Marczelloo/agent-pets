// The showcase's sound effects as data, timed from the same constants as the picture. audio/make_show_audio.py lays them over the music.
import { BEAT, BUILD, DROP, lofiBeat, T_CREW, T_END, T_MOD, T_NEEDS, T_PANEL, T_STATES, T_STATS, T_STYLES, bar, beat } from './time';

export interface Cue { t: number; name: string; v?: number; p?: number }

export function buildCues(): Cue[] {
  const c: Cue[] = [];
  const add = (t: number, name: string, v = 1, p?: number) => c.push({ t: +t.toFixed(4), name, v, p });
  for (let i = 0; i < 8; i++) add(lofiBeat(i), 'pop', 0.35, i);                       // the crew pops up on the lofi beats
  for (let i = 0; i < 8; i++) add(beat(i / 2), 'tag', 0.45, i);                       // name tags on the build bar
  add(DROP - 0.3, 'whoosh', 0.8);                                                       // the dive into Clawd
  for (let i = 1; i < 8; i++) add(T_STATES + i * BEAT, 'swish', 0.5, i);               // each new state slides in
  add(T_NEEDS - 0.17, 'band', 0.7);
  add(T_NEEDS + 0.15, 'bubble', 0.7);
  add(bar(2, 1), 'toast', 0.8);
  add(bar(2, 3), 'click', 1);
  add(T_PANEL, 'click', 0.9); add(T_PANEL + 0.05, 'pop', 0.6, 3);
  add(T_PANEL + 1.25, 'tick', 0.7);                                                     // the Limits tab
  add(T_STYLES - 0.17, 'band', 0.7);
  for (let i = 1; i < 8; i++) add(T_STYLES + i * BEAT / 2, 'snap', 0.55, i);
  add(T_STATS, 'whoosh', 0.6); add(T_STATS + BEAT, 'confetti', 0.6);
  add(T_MOD, 'whoosh', 0.5);
  for (let i = 0; i < 5; i++) add(T_MOD + BEAT * 0.6 + i * 0.06, 'key', 0.5, i);
  for (let i = 0; i < 7; i++) if (i !== 4) add(T_MOD + BEAT * 1.6 + i * BEAT * 0.25, 'tick', 0.35, i);
  add(T_CREW - 0.17, 'band', 0.7);
  add(T_END, 'phones', 0.6); add(T_END + 0.05, 'shutter', 0.5);
  void BUILD;
  return c.sort((a, b) => a.t - b.t);
}
