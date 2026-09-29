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
  /** oczy: dwie pigułki (domyślnie) albo jedno oko cyklopa w kształcie „o” z logo opencode */
  eyes?: 'pill' | 'cyclops';
  /** wielka litera nazwy agenta na brzuchu (`Pet.mark`) */
  mark?: boolean;
  /** ma własny rysunek w stylach Pixel i Sticker; bez tego te style rysują go jak Clean */
  legacy?: boolean;
  /** kolor oczu (ciemne ciało potrzebuje jasnych); domyślnie ciemne */
  eyeColor?: string;
  /** wysokość oczu jako ułamek wysokości ciała od góry (domyślnie .42) */
  eyeY?: number;
  /** głowa z logo Copilota: gogle u góry (oprawa, szkło), wizjer pod nimi z oczami, uszy po bokach */
  pilot?: { frame: string; lens: string; visor: string };
  /** bez nóg, unosi się nad ziemią i płynie zamiast chodzić (Antigravity) */
  float?: boolean;
  /** kształt ciała: zaokrąglony prostokąt (domyślnie) albo łuk „A” z otworem u dołu */
  shape?: 'arch';
  /** Cursor: ścięte boki (sześciokąt), jaśniejszy trójkąt przodu od lewego górnego rogu i jasna krawędź */
  facet?: { light: string; edge: string };
  /** Grok: ukośna kreska przez przód, od prawego górnego do lewego dolnego skraju */
  slash?: string;
  /** Grok: pierścień wokół oczu z przerwą w prawym górnym rogu, przez którą wychodzi kreska (logo) */
  ring?: string;
  /** ZCode: okrągłe uszy, łaty pod oczami (oczy na nich) i opaska z literą „Z” */
  panda?: { ears: string; patches: string; band: string; mark: string };
}
