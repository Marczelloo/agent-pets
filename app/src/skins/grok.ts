import type { Skin } from './types';
/** Grok: mały biały humanoid (głowa, szyja, barki, tułów do pasa) z czarnym wizorem, na nim dwa skośne oczy maskotki; logo Groka na klatce, czarne dłonie. */
export const grok: Skin = {
  id: 'grok', pal: { m:'#ECECEA',s:'#BDBDB9',b:'#D4D4D0',h:'#FFFFFF',g:'#C4C4C0',gs:'#A2A29E' },
  width: 68, depth: 44, height: 80, radius: 24, armLen: 24, mitt: 5.4,
  legs: [[-.17,0],[.17,0]], legW: 12,
  eyeX: .1, eyeW: 4.5, eyeH: 9, eyeY: .21, eyeColor: '#FFFFFF', eyeTilt: -.3,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  droid: { visor: '#0E0E10', logo: '#1A1A1A', hands: '#222222' },
};
