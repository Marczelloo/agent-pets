import type { Skin } from './types';
/** Copilot: ciemny, zaokrąglony hełm pilota z goglami z logo Copilota na czole; pod nimi małe jasne oczy. */
export const copilot: Skin = {
  id: 'copilot', pal: { m:'#2B2440',s:'#1F1A30',b:'#252036',h:'#4A4166',g:'#6E6A78',gs:'#57535F' },
  width: 84, depth: 54, height: 62, radius: 22, armLen: 25, mitt: 5.4,
  legs: [[-.25,0],[.25,0]], legW: 15,
  eyeX: .13, eyeW: 6.5, eyeH: 11, eyeY: .66, eyeColor: '#F2EEFF',
  screenFace: false, antenna: false, backVents: false,
  eyeGlint: false, blush: false, frontLegsOnlySitting: false,
  goggles: true,
};
