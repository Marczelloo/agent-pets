import type { Skin } from './types';
/** Antigravity: łuk „A” z logo w kolorach Google, bez nóg; unosi się nad paskiem zamiast chodzić. */
export const antigravity: Skin = {
  id: 'antigravity', pal: { m:'#4285F4',s:'#2F6AD0',b:'#3A78E0',h:'#DCE8FD',g:'#A8A49A',gs:'#86837A' },
  width: 78, depth: 50, height: 66, radius: 40, armLen: 24, mitt: 5.2,
  legs: [], legW: 0,
  eyeX: .15, eyeW: 8, eyeH: 14, eyeY: .36,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: true, blush: false, frontLegsOnlySitting: false,
  float: true, shape: 'arch',
};
