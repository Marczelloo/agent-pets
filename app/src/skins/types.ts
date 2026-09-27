export type SkinId = 'clawd' | 'kodek' | 'opencode' | 'blob';
export interface Skin {
  id: SkinId;
  pal: { m: string; s: string; b: string; h: string; g: string; gs: string };
  width: number; depth: number; height: number; radius: number;
  armLen: number; mitt: number;
  legs: [number, number][]; legW: number;
  eyeX: number; eyeW: number; eyeH: number;
  screenFace: boolean; antenna: boolean; backVents: boolean;
  eyeGlint: boolean; blush: boolean; frontLegsOnlySitting: boolean;
  /** oczy: dwie pigułki (domyślnie) albo jedno oko cyklopa w kształcie „o” z logo opencode */
  eyes?: 'pill' | 'cyclops';
  /** wielka litera nazwy agenta na brzuchu (`Pet.mark`) */
  mark?: boolean;
  /** ma własny rysunek w stylach Pixel i Sticker; bez tego te style rysują go jak Clean */
  legacy?: boolean;
}
