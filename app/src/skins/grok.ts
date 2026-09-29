import type { Skin } from './types';
/** Grok: prawie czarna kula z ukośną kreską jak logo i zawadiackimi brwiami. */
export const grok: Skin = {
  id: 'grok', pal: { m:'#141414',s:'#0C0C0C',b:'#101010',h:'#2A2A2A',g:'#6B6868',gs:'#555252' },
  width: 72, depth: 60, height: 70, radius: 36, armLen: 24, mitt: 5.2,
  legs: [[-.18,0],[.18,0]], legW: 13,
  eyeX: .22, eyeW: 6.5, eyeH: 12, eyeY: .44, eyeColor: '#F2F2F2',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  slash: '#F5F5F5', brows: '#F5F5F5',
};
