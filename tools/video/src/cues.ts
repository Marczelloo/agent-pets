// Every sound in the video, as data. The times come from the same constants that drive the animation, so picture and
// sound cannot drift apart. tools/video/audio/make_audio.py turns this list (plus its own score) into the soundtrack.
import { BEAT } from './beat';
import { KNOCKS, KNOCK_V } from './act1';
import { CALL } from './act2';
import { CATCH, CLICK, HI, HOP1, HOP2, HOP_TIME, PLANE_HIT, PLANE_THROW, SWING1 } from './act3';
import { FLIP, LOOKS, PARTY, WAKE } from './act4';
import { END, FINE, LAST_KNOCK, OFFER, TITLE } from './act5';
import { FALL_TIME, SLOTS, ZCODE } from './tower';

export interface Cue { t: number; name: string; /** loudness 0..1 */ v?: number; /** free parameter: pitch index, duration... */ p?: number }

export function buildCues(): Cue[] {
  const c: Cue[] = [];
  const add = (t: number, name: string, v = 1, p?: number) => c.push({ t: +t.toFixed(4), name, v, p });

  // hook: knocks from the first frame, quiet and rare, then harder and closer together, then HEY! on the beat
  KNOCKS.forEach((k, i) => add(k, 'knock', KNOCK_V[i], i));

  // the call and the rain
  add(CALL, 'hey', 1);
  SLOTS.filter(s => s.land > 0).forEach((s, i) => { add(s.land - FALL_TIME, 'fall', 0.8, i); add(s.land, 'land', 1, i); });
  add(ZCODE.land - FALL_TIME, 'fall', 0.7, 7); add(ZCODE.land, 'land', 0.9, 7); add(ZCODE.land + 0.5, 'snore', 0.6);

  // getting the user's attention
  add(HI, 'ping', 0.9);
  add(SWING1 - 0.22, 'whoosh', 0.9);
  add(SWING1 + 0.02, 'miss', 0.8);
  add(PLANE_THROW, 'plane', 0.9);
  add(PLANE_HIT, 'bonk', 1);
  add(CATCH - 0.22, 'whoosh', 1);
  add(CATCH, 'catch', 1);
  add(CATCH + 0.02, 'ding', 0.9);
  add(HOP1, 'hop', 0.9); add(HOP1 + HOP_TIME, 'thud', 0.7);
  add(HOP2 - 0.25, 'pop', 1, 3);
  add(HOP2, 'hop', 1); add(HOP2 + HOP_TIME, 'thud', 0.6);
  add(CLICK - 0.12, 'press', 0.9);
  add(CLICK, 'click', 1);
  add(CLICK + 0.02, 'burst', 0.9);

  // the party
  add(PARTY, 'drop', 1); add(PARTY + 0.01, 'confetti', 1); add(PARTY + 0.03, 'phones', 0.9);
  add(WAKE, 'wake', 0.9);
  LOOKS.forEach((_, i) => add(FLIP + i * BEAT, 'look', 0.9, i));

  // the group photo and the card
  add(TITLE - 0.02, 'shutter', 1); add(TITLE, 'ta-da', 1);
  add(TITLE + 0.05, 'pop', 1, 4); add(TITLE + 0.15, 'pop', 1, 5);
  [0.7, 0.8, 0.9, 1.2, 1.3].forEach((d, i) => add(TITLE + d, 'tick', 0.7, i));
  add(OFFER, 'pop', 0.9, 6); add(OFFER + 0.35, 'tick', 0.6, 5); add(FINE, 'tick', 0.3, 0);
  add(LAST_KNOCK, 'knock', 0.8, 9);
  return c.sort((a, b) => a.t - b.t);
}

export const DURATION_S = END;
