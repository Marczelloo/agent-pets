import type { StyleId } from '../types';

/** Styl rysowania: dane i flagi czytane przez `pen.ts` i `draw/body.ts`; geometria i animacja są wspólne. */
export interface StyleDef {
  id: StyleId;
  /** sposób rysowania: wektorowy (body.ts), naklejka przodem, piksele na siatce */
  model: 'vector' | 'sticker' | 'pixel';
  /** kontur: najmniejsza grubość w px CSS i mnożnik dzisiejszej grubości 2,4·u */
  line: { minPx: number; scale: number };
  /** kolor konturu zwierzaka i rekwizytów; `accent` to kolor agenta */
  ink: (accent: string) => string;
  /** kolor konturu jednego kształtu liczony z jego wypełnienia (Pastel) */
  strokeFor?: (fill: string) => string;
  /** zmiana wypełnienia każdego kształtu (Neon, Tusz, Pastel) */
  fillFor?: (fill: string) => string;
  fill: 'flat' | 'gradient';
  glow?: boolean;
  brush?: boolean;
  softShadow?: boolean;
  /** Szkic: drganie konturu, przesunięcie wypełnienia i odstęp kreskowania, minima w px CSS */
  sketch?: {
    jitterPx: number; offsetPx: number; hatchGapPx: number;
    /** przejścia konturu (pierwsze pełne, kolejne cieńsze i bledsze) */
    passes: number;
    /** drganie konturu na sekundę, z zegara zwierzaka */
    boilHz: number;
    /** wypełnienie kreskowaniem na lekkim tle zamiast płaskiej plamy */
    hatchFill: boolean;
  };
  face?: { eyes?: 'accent' };
}
