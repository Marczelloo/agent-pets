import type { SkinId } from '../skins';
import type { StyleId } from '../types';
import { clean } from './clean';
import { ink } from './ink';
import { neon } from './neon';
import { pastel } from './pastel';
import { sketch } from './sketch';
import { sticker } from './sticker';
import type { StyleDef } from './types';
export type { StyleDef } from './types';
/** Kolor agenta (poświata Neonu, oczy, akcenty). */
export const ACCENT: Record<SkinId, string> = { clawd: '#D97757', kodek: '#5DCAA5' };
export const STYLES: Record<StyleId, StyleDef> = {
  clean, sketch, sticker, pixel: clean, neon, ink, pastel,
};
