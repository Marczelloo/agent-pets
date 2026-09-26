import { SCENES, type Scene } from '../scenes';
import { STATES } from './states';
import { WORK } from './work';

/** Choreografie Anime (spec 8.3): te same klucze co `SCENES`. */
export const SCENES_ANIME: Record<string, Scene> = { ...SCENES, ...WORK, ...STATES };
