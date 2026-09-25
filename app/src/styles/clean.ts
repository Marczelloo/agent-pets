import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Dzisiejszy rysunek bez szkicu: parytet z prototypem v6. */
export const clean: StyleDef = { id: 'clean', model: 'vector', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat' };
