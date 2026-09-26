import { SCENES, type Scene } from '../scenes';
import { WORK } from './work';

/** Choreografie Anime (spec 8.3): te same klucze co `SCENES`; sceny bez własnej choreografii grają wersję Spokojną. */
export const SCENES_ANIME: Record<string, Scene> = { ...SCENES, ...WORK };
