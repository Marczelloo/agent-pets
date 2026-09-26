import { SCENES, type Scene } from '../scenes';
import { STATES } from './states';
import { WORK } from './work';

/** Choreografie Dynamiczny (spec 8.3): te same klucze co `SCENES`. */
export const SCENES_DYNAMIC: Record<string, Scene> = { ...SCENES, ...WORK, ...STATES };
