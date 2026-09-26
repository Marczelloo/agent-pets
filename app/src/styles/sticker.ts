import type { StyleDef } from './types';
/** Styl ikony aplikacji: osobny model naklejki (`renderer/models/sticker.ts`) — wygląd bryły, twarzy i dodatków jest tam. */
export const sticker: StyleDef = {
  id: 'sticker', model: 'sticker', line: { minPx: 2, scale: 1.3 }, ink: () => '#1E1410', fill: 'gradient',
};
