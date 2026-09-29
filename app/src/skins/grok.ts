import type { Skin } from './types';
/** Grok: czarna kula z dwoma skośnymi białymi oczami w prawym górnym rogu, jak jego maskotka. */
export const grok: Skin = {
  id: 'grok', pal: { m:'#0A0A0A',s:'#050505',b:'#080808',h:'#242424',g:'#6B6868',gs:'#555252' },
  width: 72, depth: 60, height: 70, radius: 36, armLen: 24, mitt: 5.2,
  legs: [[-.18,0],[.18,0]], legW: 13,
  eyeX: .13, eyeW: 6, eyeH: 13, eyeY: .32, eyeColor: '#FFFFFF', eyeShift: .17, eyeTilt: -.35,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
};
