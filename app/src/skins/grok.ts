import type { Skin } from './types';
/** Grok: mały biały humanoid z czarnym wizorem, na nim dwa skośne oczy maskotki; logo Groka na klatce, czarne dłonie. */
export const grok: Skin = {
  id: 'grok', pal: { m:'#ECECEA',s:'#BDBDB9',b:'#D4D4D0',h:'#FFFFFF',g:'#C4C4C0',gs:'#A2A29E' },
  width: 64, depth: 50, height: 76, radius: 18, armLen: 24, mitt: 5.4,
  legs: [[-.2,0],[.2,0]], legW: 13,
  eyeX: .14, eyeW: 5.5, eyeH: 11, eyeY: .3, eyeColor: '#FFFFFF', eyeTilt: -.3,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  droid: { visor: '#0E0E10', logo: '#1A1A1A', hands: '#222222' },
};
