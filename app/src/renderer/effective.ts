import { SKINS, type SkinId } from '../skins';
import type { StyleId } from '../types';

/** Pixel and Sticker have drawings tailored to Clawd and Codex; other skins render in them as Clean (spec 0.10, 5.3). */
export function effectiveStyle(style: StyleId, skin: SkinId): StyleId {
  return (style === 'pixel' || style === 'sticker') && !SKINS[skin]?.legacy ? 'clean' : style;
}
