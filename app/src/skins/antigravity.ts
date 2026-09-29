import type { Skin } from './types';
/** Antigravity: ludzik Androida (Google), zielony, z dwiema antenkami; unosi się nad paskiem, nóżki wiszą w powietrzu.
 * Robot Androida: Google, licencja CC BY 3.0. */
export const antigravity: Skin = {
  id: 'antigravity', pal: { m:'#3DDC84',s:'#2BB06A',b:'#34C677',h:'#C9F5DC',g:'#A8A49A',gs:'#86837A' },
  width: 68, depth: 68, height: 68, radius: 13, armLen: 22, mitt: 5.5,
  legs: [[-.22,0],[.22,0]], legW: 15,
  eyeX: .19, eyeW: 6.5, eyeH: 6.5, eyeY: .24, eyeColor: '#FFFFFF',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  float: true, shape: 'android',
};
