// The two deliverables. The story is one timeline; each format only changes framing and layout.

export type FormatId = '16x9' | '9x16';

export interface Format {
  id: FormatId;
  W: number;
  H: number;
  portrait: boolean;
  /** UI safe margins in px: X and the vertical-video apps put buttons and captions over the edges. */
  safe: { top: number; bottom: number; side: number };
}

export const FORMATS: Record<FormatId, Format> = {
  '16x9': { id: '16x9', W: 1920, H: 1080, portrait: false, safe: { top: 60, bottom: 110, side: 100 } },
  '9x16': { id: '9x16', W: 1080, H: 1920, portrait: true, safe: { top: 200, bottom: 380, side: 70 } },
};
