import type { Skin } from './types';
/** opencode: kanciasty grafitowy klocek-terminal, na ekranie oczy `>` i `_` (spec 0.10, 5.1). */
export const opencode: Skin = {
  id: 'opencode', pal: { m:'#5A5A61',s:'#434349',b:'#4E4E55',h:'#7C7C85',g:'#6B6B70',gs:'#55555A' },
  width: 84, depth: 52, height: 62, radius: 6, armLen: 26, mitt: 5.5,
  legs: [[-.25,0],[.25,0]], legW: 16,
  eyeX: .17, eyeW: 8.5, eyeH: 15,
  screenFace: true, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  eyes: 'prompt', screen: { bg: '#1E1E1E', fg: '#F5F5F5' },
};
