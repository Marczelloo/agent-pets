import type { MotionId } from '../types';

/** Profil ruchu: zegar i sprężyny (`tick`) oraz efekty Anime (`fx.ts`, smugi w `PetPainter`). */
export interface MotionDef {
  id: MotionId;
  /** mnożnik zegara zwierzaka (akcje, pisanie, machanie) */
  tempo: number;
  /** mnożniki sztywności i tłumienia sprężyn */
  spring: { k: number; d: number };
  /** mnożnik squash & stretch przy skokach */
  squash: number;
  trails: boolean;
  speedLines: boolean;
  impacts: boolean;
  emotes: boolean;
}
