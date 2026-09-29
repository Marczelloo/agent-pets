import type { StyleDef } from './types';
/** App icon style: separate sticker model (`renderer/models/sticker.ts`); its shape, face, and accessories are defined there. */
export const sticker: StyleDef = {
  id: 'sticker', model: 'sticker', line: { minPx: 2, scale: 1.3 }, ink: () => '#1E1410', fill: 'gradient',
};
