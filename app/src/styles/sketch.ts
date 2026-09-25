import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Szkic prototypu z minimami w px CSS, żeby drganie i kreskowanie było widać w pasku (u = 0,3). */
export const sketch: StyleDef = {
  id: 'sketch', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat',
  sketch: { jitterPx: 1.2, offsetPx: 0.9, hatchGapPx: 3 },
};
