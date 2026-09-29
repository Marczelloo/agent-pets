import type { StyleId } from '../types';

/** Drawing style: data and flags read by `pen.ts` and `draw/body.ts`; geometry and animation are shared. */
export interface StyleDef {
  id: StyleId;
  /** drawing method: vector (body.ts), front-facing sticker, grid pixels */
  model: 'vector' | 'sticker' | 'pixel';
  /** outline: minimum width in CSS px and multiplier of the current 2.4·u width */
  line: { minPx: number; scale: number };
  /** outline color for pet and props; `accent` is the agent color */
  ink: (accent: string) => string;
  /** outline color of each shape derived from its fill (Pastel) */
  strokeFor?: (fill: string) => string;
  /** change to each shape's fill (Neon, Ink, Pastel) */
  fillFor?: (fill: string) => string;
  fill: 'flat' | 'gradient';
  glow?: boolean;
  brush?: boolean;
  softShadow?: boolean;
  /** Sketch: outline jitter, fill offset, and hatching spacing, minimums in CSS px */
  sketch?: {
    jitterPx: number; offsetPx: number; hatchGapPx: number;
    /** outline passes (first solid, later ones thinner and fainter) */
    passes: number;
    /** outline jitter per second, from the pet clock */
    boilHz: number;
    /** hatched fill on a light background instead of a flat area */
    hatchFill: boolean;
  };
  face?: { eyes?: 'accent' };
}
