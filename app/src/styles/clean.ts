import { OL } from '../renderer/palette';
import type { StyleDef } from './types';
/** Current drawing without sketch: parity with the v6 prototype. */
export const clean: StyleDef = { id: 'clean', model: 'vector', line: { minPx: 1, scale: 1 }, ink: () => OL, fill: 'flat' };
