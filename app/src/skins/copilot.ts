import type { Skin } from './types';
/** Copilot: głowa z logo Copilota. Szeroki hełm z brązowej skóry, z kopułą i uszami, u góry gogle, niżej wizjer z dwoma małymi oczami. */
export const copilot: Skin = {
  id: 'copilot', pal: { m:'#8A5A3B',s:'#6B4329',b:'#7A4E32',h:'#A8744F',g:'#5C3B27',gs:'#472D1D' },
  width: 88, depth: 54, height: 64, radius: 30, armLen: 25, mitt: 5.4,
  legs: [[-.25,0],[.25,0]], legW: 15,
  eyeX: .09, eyeW: 6, eyeH: 11, eyeY: .5, eyeColor: '#F4EEFF',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  pilot: { frame: '#3A2518', lens: '#5BA8E6', visor: '#24292F' },
};
