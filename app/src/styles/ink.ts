import { luma } from '../renderer/color';
import type { StyleDef } from './types';
/** Tusz: jasne szarości z luminancji, czarny kontur pędzlem; akcent zostaje w oczach i efektach. */
export const ink: StyleDef = {
  id: 'ink', line: { minPx: 1.6, scale: 1.4 }, ink: () => '#111111', fill: 'flat', brush: true,
  fillFor: f => { const v = Math.round(200 + 55 * luma(f)); return `rgb(${v},${v},${v})`; },
};
