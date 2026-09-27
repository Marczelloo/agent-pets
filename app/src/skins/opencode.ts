import type { Skin } from './types';
/** opencode: cyklop w szarości logo; jedyne oko to „o” z logo opencode (jasna ramka, otwór u góry, powieka w kolorze ciała). */
export const opencode: Skin = {
  id: 'opencode', pal: { m:'#4B4646',s:'#383434',b:'#433F3F',h:'#6E6868',g:'#6B6868',gs:'#555252' },
  width: 80, depth: 52, height: 66, radius: 12, armLen: 26, mitt: 5.5,
  legs: [[-.25,0],[.25,0]], legW: 16,
  eyeX: 0, eyeW: 8.5, eyeH: 15,
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  eyes: 'cyclops',
};
