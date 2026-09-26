import type { MotionId } from '../types';

/** Profil ruchu: zegar i sprężyny (`tick`); `fx` włącza choreografie i efekty Anime (`renderer/anime`, `motion/fx`). */
export interface MotionDef {
  id: MotionId;
  /** mnożnik zegara zwierzaka */
  tempo: number;
  /** mnożniki sprężyn; `crit` = krytycznie tłumione, liczone analitycznie (bez przestrzelenia) */
  spring: { k: number; d: number; crit?: boolean };
  /** mnożnik squash & stretch przy skokach */
  squash: number;
  fx: boolean;
}

/** Co efekty Anime mogą w tej klatce: tło akcji, błyski, wstrząs, część cząsteczek (1 albo 0,5). */
export interface FxEnv { fx: boolean; bg: boolean; flash: boolean; shake: boolean; parts: number }
