import type { Skin } from './types';
/** Cursor: czarny sześciokątny klocek jak logo, z jaśniejszą fasetką od lewego górnego rogu i jasną krawędzią. */
export const cursor: Skin = {
  id: 'cursor', pal: { m:'#1A1A1A',s:'#111111',b:'#161616',h:'#2E2E2E',g:'#6B6868',gs:'#555252' },
  width: 84, depth: 54, height: 66, radius: 6, armLen: 25, mitt: 5.4,
  legs: [[-.25,0],[.25,0]], legW: 15,
  eyeX: .2, eyeW: 7, eyeH: 13, eyeY: .46, eyeColor: '#F2F2F2',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  facet: { light: '#3A3A3A', edge: '#E6E6E6' },
};
