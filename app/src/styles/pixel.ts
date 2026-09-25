import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Rysowany na małym płótnie i powiększany bez wygładzania (PetPainter). */
export const pixel: StyleDef = { id: 'pixel', model: 'pixel', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat' };
