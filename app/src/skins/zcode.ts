import type { Skin } from './types';
/** ZCode: panda z opaską z literą „Z” na czole; oczy na czarnych łatach. */
export const zcode: Skin = {
  id: 'zcode', pal: { m:'#F4F4F2',s:'#D9D9D5',b:'#E6E6E2',h:'#FFFFFF',g:'#A8A49A',gs:'#86837A' },
  width: 86, depth: 56, height: 64, radius: 26, armLen: 25, mitt: 5.6,
  legs: [[-.25,0],[.25,0]], legW: 16,
  eyeX: .21, eyeW: 6, eyeH: 10, eyeY: .5, eyeColor: '#F7F7F7',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  panda: { ears: '#1B1B1B', patches: '#1B1B1B', band: '#2F6BFF', mark: '#FFFFFF' },
};
