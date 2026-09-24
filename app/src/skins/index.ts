import { clawd } from './clawd';
import { kodek } from './kodek';
import type { Skin, SkinId } from './types';
export type { Skin, SkinId } from './types';
export const SKINS: Record<SkinId, Skin> = { clawd, kodek };
