export type SkinId = 'clawd' | 'kodek';
export interface Skin {
  id: SkinId;
  pal: { m: string; s: string; b: string; h: string; g: string; gs: string };
  width: number; depth: number; height: number; radius: number;
  armLen: number; mitt: number;
  legs: [number, number][]; legW: number;
  eyeX: number; eyeW: number; eyeH: number;
  screenFace: boolean; antenna: boolean; backVents: boolean;
  eyeGlint: boolean; blush: boolean; frontLegsOnlySitting: boolean;
}
