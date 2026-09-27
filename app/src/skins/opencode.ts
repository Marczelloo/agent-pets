import type { Skin } from './types';
/** opencode: kanciasty grafitowy klocek-terminal, na ekranie oczy `>` i `_` (spec 0.10, 5.1). */
export const opencode: Skin = {
  id: 'opencode', pal: { m:'#3B3B3F',s:'#2A2A2E',b:'#333337',h:'#57575C',g:'#5A5A5E',gs:'#48484C' },
  width: 84, depth: 52, height: 62, radius: 6, armLen: 26, mitt: 5.5,
  legs: [[-.25,0],[.25,0]], legW: 16,
  eyeX: .17, eyeW: 8.5, eyeH: 15,
  screenFace: true, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  eyes: 'prompt', screen: { bg: '#1E1E1E', fg: '#F5F5F5' },
};
