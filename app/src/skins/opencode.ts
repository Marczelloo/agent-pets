import type { Skin } from './types';
/** opencode: prawie czarny kanciasty cyklop, jak tło logo; jedyne oko to „o” z logo opencode (jasna ramka, otwór u góry, powieka w kolorze ciała). */
export const opencode: Skin = {
  id: 'opencode', pal: { m:'#211E1E',s:'#171414',b:'#1C1919',h:'#3A3535',g:'#6B6868',gs:'#555252' },
  width: 80, depth: 52, height: 66, radius: 3, armLen: 26, mitt: 5.5,
  legs: [[-.25,0],[.25,0]], legW: 16,
  eyeX: 0, eyeW: 8.5, eyeH: 15,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  eyes: 'cyclops',
};
