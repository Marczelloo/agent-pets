// Camera: world units are pet units ("pu", 1 pu = one `u` of the pet renderer, a pet is ~100 pu wide).
// The camera is a pure function of time, so any frame can be reproduced and both formats share one timeline.
import type { Format } from './format';
import { clamp, easeInOut, lerp, type Ease } from './util';

export interface Cam { x: number; y: number; z: number }
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export type CamFn = (t: number) => Cam;

export const worldToScreen = (cam: Cam, fmt: Format, wx: number, wy: number): [number, number] =>
  [fmt.W / 2 + (wx - cam.x) * cam.z, fmt.H / 2 + (wy - cam.y) * cam.z];

export interface FitOpts { top?: number; bottom?: number; side?: number; /** pin the taskbar top (world y = 0) to this screen y instead of centring the rect */ ground?: number }

/**
 * Camera that fits `rect` (world pu) into the frame. `top` px are kept free for captions, `bottom` px for the platform UI.
 * The same rect gives a tight portrait framing and a wide landscape framing without per-format numbers.
 */
export function fit(rect: Rect, fmt: Format, o: FitOpts = {}): Cam {
  const top = o.top ?? 0, bottom = o.bottom ?? fmt.safe.bottom * 0.4, side = o.side ?? fmt.safe.side * 0.5;
  const aw = fmt.W - 2 * side, ah = fmt.H - top - bottom;
  const rw = rect.x1 - rect.x0, rh = rect.y1 - rect.y0, z = Math.min(aw / rw, ah / rh);
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  return { x: cx, y: o.ground != null ? (fmt.H / 2 - o.ground) / z : cy - (top + ah / 2 - fmt.H / 2) / z, z };
}

/** Blend two cameras; zoom is interpolated in log space so pushes and pulls feel even. */
export function mixCam(a: Cam, b: Cam, k: number): Cam {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) };
}

/** Piecewise camera through [time, camera function, ease?] keys; the ease of the destination key shapes each move. */
export function camPath(keys: [number, CamFn, Ease?][]): CamFn {
  return t => {
    if (t <= keys[0][0]) return keys[0][1](t);
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, f0] = keys[i - 1], [t1, f1, e] = keys[i];
        return mixCam(f0(t), f1(t), (e ?? easeInOut)(clamp((t - t0) / (t1 - t0))));
      }
    }
    const last = keys[keys.length - 1];
    return last[1](t);
  };
}

export const still = (c: Cam): CamFn => () => c;
