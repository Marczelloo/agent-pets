import type { Skin } from './types';
/** Copilot: głowa z logo Copilota. Szeroki hełm z kopułą i uszami, u góry gogle, niżej wizjer z dwoma małymi oczami. */
export const copilot: Skin = {
  id: 'copilot', pal: { m:'#F3F1F6',s:'#D3CFDA',b:'#E4E1EA',h:'#FFFFFF',g:'#C9C6BD',gs:'#A5A298' },
  width: 88, depth: 54, height: 64, radius: 30, armLen: 25, mitt: 5.4,
  legs: [[-.25,0],[.25,0]], legW: 15,
  eyeX: .09, eyeW: 6, eyeH: 11, eyeY: .72, eyeColor: '#F4EEFF',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  pilot: { frame: '#24292F', lens: '#8534F3', visor: '#24292F' },
};
