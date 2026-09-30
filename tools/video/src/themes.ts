// A backdrop per pet look, so every beat of the "seven looks" flip reads as a different world.
import type { StyleId } from '@app/types';

export interface Theme {
  bg: string; glow: string;
  win: string; winEdge: string; winBar: string; winLine: string; winLine2: string;
  /** caption ink and its lighter sibling */
  text: string; sub: string;
}

export const CREAM: Theme = {
  bg: '#FBF1E8', glow: '#F7DDC9', win: '#FFF9F3', winEdge: '#EED9C8', winBar: '#F6E6D8', winLine: '#F1E0D0', winLine2: '#EAD3BF', text: '#2B2622', sub: '#8A7D72',
};

export const THEME: Record<StyleId, Theme> = {
  clean: CREAM,
  sticker: { ...CREAM, bg: '#FFE9D8', glow: '#FFD1B0', win: '#FFF6EE', winEdge: '#F6CDB3', winBar: '#FCDCC8', winLine: '#F8DAC6', winLine2: '#F2C7AC' },
  sketch: { ...CREAM, bg: '#F6F1E6', glow: '#EBE2CF', win: '#FBF8F1', winEdge: '#DDD3BE', winBar: '#EFE8D8', winLine: '#E8E0CE', winLine2: '#DDD2BB', text: '#3B3A38' },
  pixel: { ...CREAM, bg: '#E8F3EA', glow: '#C9E6D2', win: '#F3FAF4', winEdge: '#BFDCC8', winBar: '#DCEEE1', winLine: '#D3E8D9', winLine2: '#C0DCCA' },
  neon: { bg: '#14111C', glow: '#3B2365', win: '#1E1929', winEdge: '#382C55', winBar: '#282139', winLine: '#2E2640', winLine2: '#3A3050', text: '#F6F2EA', sub: '#A99BC8' },
  ink: { ...CREAM, bg: '#FFFFFF', glow: '#EDEDED', win: '#FAFAFA', winEdge: '#DADADA', winBar: '#EFEFEF', winLine: '#E6E6E6', winLine2: '#D6D6D6', text: '#111111', sub: '#777777' },
  pastel: { ...CREAM, bg: '#FBE8EF', glow: '#F6CDE0', win: '#FFF4F8', winEdge: '#F1C8D8', winBar: '#F8DCE7', winLine: '#F5D5E2', winLine2: '#EEC3D5' },
};

export const STYLE_NAMES: Record<StyleId, string> = { sticker: 'Sticker', sketch: 'Sketch', clean: 'Clean', pixel: 'Pixel art', neon: 'Neon', ink: 'Ink', pastel: 'Pastel' };
