import type { StyleDef } from './types';
/** Styl ikony aplikacji: gruby kontur, zaokrąglone bryły, gradient, uśmiech, rumieńce, uszka i słuchawki. */
export const sticker: StyleDef = {
  id: 'sticker', model: 'sticker', line: { minPx: 2, scale: 1.3 }, ink: () => '#1E1410', fill: 'gradient',
  shape: { radius: { clawd: 12, kodek: 22 }, flatSide: true },
  face: { smile: true, blush: true }, extras: { ears: true, phones: true },
};
