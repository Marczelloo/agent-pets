import { SKINS, type SkinId } from '../skins';
import type { StyleId } from '../types';

/** Pixel i Sticker mają rysunek pisany pod Clawda i Kodka; pozostałe skórki rysują w nich jak w Clean (spec 0.10, 5.3). */
export function effectiveStyle(style: StyleId, skin: SkinId): StyleId {
  return (style === 'pixel' || style === 'sticker') && !SKINS[skin]?.legacy ? 'clean' : style;
}
