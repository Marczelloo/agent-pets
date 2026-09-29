import { darken, lighten } from '../renderer/color';
import type { StyleDef } from './types';
/** Lightened colors, outline tinted to the fill, soft shadow. */
export const pastel: StyleDef = {
  id: 'pastel', model: 'vector', line: { minPx: 1, scale: 0.8 }, ink: () => '#9A8C84', fill: 'flat', softShadow: true,
  fillFor: f => lighten(f, 0.45), strokeFor: f => darken(f, 0.3),
};
