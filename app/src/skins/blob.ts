import type { Skin } from './types';
/** Uniwersalny zwierzak agenta bez maskotki (furtka): niski okrągły blob bez nóg; kolor i litera z nazwy (`petFor`). */
export const blob: Skin = {
  id: 'blob', pal: { m:'#B4B0A6',s:'#8C887E',b:'#A09C92',h:'#E4E1D9',g:'#A8A49A',gs:'#86837A' },
  width: 78, depth: 58, height: 60, radius: 26, armLen: 24, mitt: 5.2,
  legs: [], legW: 0,
  eyeX: .18, eyeW: 9, eyeH: 16,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: true, blush: false, frontLegsOnlySitting: false,
  mark: true,
};
