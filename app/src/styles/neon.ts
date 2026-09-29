import { lighten, mix } from '../renderer/color';
import type { StyleDef } from './types';
/** Dark shapes, outline, and eyes in the agent color with a glow. */
export const neon: StyleDef = {
  id: 'neon', model: 'vector', line: { minPx: 1.5, scale: 1 }, ink: a => lighten(a, 0.25), fill: 'flat', glow: true,
  fillFor: f => mix(f, '#15131A', 0.84), face: { eyes: 'accent' },
};
