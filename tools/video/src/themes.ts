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

/** The default desktop: a dark Windows 11 look, navy with a blue bloom behind the crew. */
export const DARK: Theme = {
  bg: '#0E1320', glow: '#1F3878', win: '#161D2D', winEdge: '#26314D', winBar: '#1D2639', winLine: '#212B42', winLine2: '#2B3853', text: '#EEF1F6', sub: '#8B96AD',
};

export const THEME: Record<StyleId, Theme> = {
  clean: DARK,
  sticker: { bg: '#1A1310', glow: '#7A4426', win: '#241A16', winEdge: '#3B2A21', winBar: '#2C211B', winLine: '#32251E', winLine2: '#40302A', text: '#F6EEE8', sub: '#A38F82' },
  sketch: { bg: '#181A19', glow: '#54594C', win: '#222524', winEdge: '#393E3A', winBar: '#2A2E2B', winLine: '#2F3431', winLine2: '#3A403C', text: '#ECEBE6', sub: '#98988F' },
  pixel: { bg: '#09140F', glow: '#1F7050', win: '#0F1E18', winEdge: '#1D3E32', winBar: '#13281E', winLine: '#183226', winLine2: '#22443A', text: '#E6F6EE', sub: '#7FA894' },
  neon: { bg: '#14111C', glow: '#4A2A85', win: '#1E1929', winEdge: '#382C55', winBar: '#282139', winLine: '#2E2640', winLine2: '#3A3050', text: '#F6F2EA', sub: '#A99BC8' },
  ink: { bg: '#EEEEEC', glow: '#FFFFFF', win: '#FAFAFA', winEdge: '#D6D6D6', winBar: '#EBEBEB', winLine: '#E3E3E3', winLine2: '#D3D3D3', text: '#111111', sub: '#777777' },
  pastel: { bg: '#1B121F', glow: '#82407A', win: '#251929', winEdge: '#3F2848', winBar: '#2D2033', winLine: '#33223A', winLine2: '#443049', text: '#F7ECF6', sub: '#AA90A9' },
};

export const STYLE_NAMES: Record<StyleId, string> = { sticker: 'Sticker', sketch: 'Sketch', clean: 'Clean', pixel: 'Pixel art', neon: 'Neon', ink: 'Ink', pastel: 'Pastel' };
