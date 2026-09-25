import type { StyleDef } from './types';
/** Ołówek: grafitowy kontur w kilku luźnych przejściach, kreskowane wypełnienia, szybkie drganie (spec wyglądu v2, 4). */
export const sketch: StyleDef = {
  id: 'sketch', model: 'vector', line: { minPx: 1, scale: .9 }, ink: () => '#3B3A38', fill: 'flat',
  sketch: { jitterPx: 2.2, offsetPx: 1.4, hatchGapPx: 2.6, passes: 3, boilHz: 12, hatchFill: true },
};
