import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Drawn on a small canvas and enlarged without smoothing (PetPainter). */
export const pixel: StyleDef = { id: 'pixel', model: 'pixel', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat' };
