// What each act of the story sees and writes into. Acts are chronological functions of time: they run every frame once their
// start time has passed and set whatever they own, and a later act simply overwrites an earlier one (last writer wins).
import type { Actor, Spec, Who } from './actors';
import type { Cam } from './camera';
import type { Format } from './format';
import type { Theme } from './themes';
import type { TaskbarOpts, Wipe } from './world';

export type Overlay = (x: CanvasRenderingContext2D, cam: Cam) => void;

export interface Ctx {
  T: number;
  fmt: Format;
  crew: Record<Who, Actor>;
  /** overlays drawn behind the pets and in front of them, in push order */
  back: Overlay[];
  front: Overlay[];
  /** drawn after the cursor: full-frame flashes and anything that must sit above everything */
  top: Overlay[];
  /** cursor state (screen-independent, world pu) drawn last so it always sits on top of the pets */
  cursor: { x: number; y: number; rot: number; size: number; alpha: number; press: number;
    /** evaluated after the pets are drawn (it may depend on where a net ended up this frame); wins over x/y */
    late?: (cam: Cam) => { screen: [number, number]; rot?: number; press?: number; size?: number } | null };
  /** camera impulses: [time, strength] hits punch the zoom and shake the frame */
  punches: [number, number][];
  /** backdrop theme (a look's colours) and the circle wipe between two of them */
  theme: Theme; wipe?: Wipe;
  /** how visible the user's desktop windows are (0..1); they fade for the end card */
  windows: number;
  /** little progress / equaliser lines under pets on the taskbar */
  bars: NonNullable<TaskbarOpts['bars']>;
  /** forget an actor's pose so a later act can define it from scratch */
  reset(who: Who): void;
  /** merge a partial spec into an actor */
  set(who: Who, p: Partial<Spec>): void;
  /** merge pose parameters into an actor's puppet drive */
  pose(who: Who, params: Record<string, unknown>): void;
  /** a pet's own particle (hearts, sparkles, impact lines) pushed into its world-fx list at a given moment */
  emit(who: Who, part: Record<string, unknown>): void;
}
