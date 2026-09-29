export type SkinId = 'clawd' | 'kodek' | 'opencode' | 'blob' | 'copilot' | 'antigravity' | 'cursor' | 'grok' | 'zcode';
export interface Skin {
  id: SkinId;
  pal: { m: string; s: string; b: string; h: string; g: string; gs: string };
  width: number; depth: number; height: number; radius: number;
  armLen: number; mitt: number;
  legs: [number, number][]; legW: number;
  eyeX: number; eyeW: number; eyeH: number;
  screenFace: boolean; antenna: boolean; backVents: boolean;
  eyeGlint: boolean; blush: boolean; frontLegsOnlySitting: boolean;
  /** eyes: two pills (default) or one cyclops eye shaped like the opencode logo's "o" */
  eyes?: 'pill' | 'cyclops';
  /** uppercase initial of agent name on the belly (`Pet.mark`) */
  mark?: boolean;
  /** has custom Pixel and Sticker drawings; otherwise these styles draw it like Clean */
  legacy?: boolean;
  /** eye color (dark bodies need light eyes); dark by default */
  eyeColor?: string;
  /** eye height as a fraction of body height from the top (default .42) */
  eyeY?: number;
  /** Copilot logo head: goggles on top (frame, lenses), visor with eyes below, ears at the sides */
  pilot?: { frame: string; lens: string; visor: string };
  /** legless, floats above the ground instead of walking (Antigravity) */
  float?: boolean;
  /** body shape: rounded rectangle (default) or Android mascot (dome and torso, two antennae) */
  shape?: 'android';
  /** Cursor: cut sides (hexagon), lighter front triangle from the top left and a light edge */
  facet?: { light: string; edge: string };
  /** Grok: small humanoid; black visor high on the front (eyes on it), Grok logo on the chest, black hands */
  droid?: { visor: string; logo: string; hands: string };
  /** leg length in units (default 17); longer legs raise the body */
  legLen?: number;
  /** arm thickness in units (default 9) */
  armThk?: number;
  /** ZCode: round ears, eye patches (eyes on them), and a headband with "Z" */
  panda?: { ears: string; patches: string; band: string; mark: string };
}
