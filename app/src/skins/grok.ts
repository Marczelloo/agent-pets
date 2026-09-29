import type { Skin } from './types';
/** Grok: mały biały humanoid (głowa, szyja, barki, klatka do czarnego pasa, biodra, długie nogi z czarnymi kolanami i stopami)
 *  z czarnym wizorem, na nim dwa proste białe oczy; logo Groka na klatce, czarne dłonie. */
export const grok: Skin = {
  id: 'grok', pal: { m:'#ECECEA',s:'#BDBDB9',b:'#D4D4D0',h:'#FFFFFF',g:'#C4C4C0',gs:'#A2A29E' },
  width: 66, depth: 40, height: 62, radius: 26, armLen: 27, mitt: 4.8, armThk: 7,
  legs: [[-.13,0],[.13,0]], legW: 9.5, legLen: 29,
  eyeX: .075, eyeW: 4, eyeH: 7.5, eyeY: .16, eyeColor: '#FFFFFF',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  droid: { visor: '#0E0E10', logo: '#1A1A1A', hands: '#222222' },
};
