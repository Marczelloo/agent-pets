import type { SkinId } from '../skins';
import type { StyleId } from '../types';
import { clean } from './clean';
import { sketch } from './sketch';
import type { StyleDef } from './types';
export type { StyleDef } from './types';
/** Kolor agenta (poświata Neonu, oczy, akcenty). */
export const ACCENT: Record<SkinId, string> = { clawd: '#D97757', kodek: '#5DCAA5' };
export const STYLES: Record<StyleId, StyleDef> = {
  clean, sketch, sticker: clean, pixel: clean, neon: clean, ink: clean, pastel: clean,
};
