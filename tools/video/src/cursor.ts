// The user's mouse cursor: a character in its own right. Acts blend from `wander` into whatever the crew does to it.
import { easeInOut, lerp, remap } from './util';

const SPOTS: [number, number][] = [[40, -335], [150, -305], [190, -350], [95, -315], [10, -300], [165, -330]];

/** Idle browsing: dwell on a spot, glide to the next, now and then click a link. */
export function wander(T: number): { x: number; y: number; press: number; rot: number } {
  const seg = 1.7, k = Math.floor(T / seg), f = (T % seg) / seg;
  const a = SPOTS[k % SPOTS.length], b = SPOTS[(k + 1) % SPOTS.length];
  const m = easeInOut(remap(f, 0.5, 1));
  return {
    x: lerp(a[0], b[0], m) + 5 * Math.sin(T * 2.3), y: lerp(a[1], b[1], m) + 4 * Math.sin(T * 1.7 + 1),
    press: f > 0.22 && f < 0.34 && k % 3 === 1 ? 1 : 0, rot: 0,
  };
}
