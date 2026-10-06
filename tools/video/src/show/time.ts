// The showcase's clock, read off the two licensed tracks it is cut to (see audio/make_show_audio.py for the cut itself):
//   0     - 4.93 s  Lofi Vlog, its first seven beats (87.02 BPM), the calm intro
//   4.93  - 5.62 s  the break: the lofi is spun back like a record, a breath of silence, then the last half beat of Running Night's build
//   5.62  - 12.41 s Running Night 71.71 - 78.50 s: its first three bars from the drop (106.01 BPM)
//   12.41 - end     Running Night 94.35 s to its real ending: six more bars and the final hit
// The beat grid runs on unbroken through both Running Night pieces, so every scene change lands on a bar line.

export const FPS = 60;

/** Lofi Vlog: beat k (0..7) of the intro. */
export const LOFI_BEAT = 60 / 87.02;
export const lofiBeat = (k: number): number => 0.104 + k * LOFI_BEAT;

/** The lofi beat where the record is stopped. */
export const SCRATCH = lofiBeat(7);
/** Running Night comes in at its drop. */
export const HIT = 5.62;
export const BEAT = 60 / 106.01;
export const BAR = 4 * BEAT;
/** Beat k counted from the hit (k = 0 .. 3 is "Meet the crew."). */
export const beat = (k: number): number => HIT + k * BEAT;
/** The tour of the app starts one bar after the hit. */
export const TOUR = beat(4);
/** Bar n of the tour. */
export const bar = (n: number, b = 0): number => TOUR + n * BAR + b * BEAT;

/** Where each scene starts. */
export const T_STATES = bar(0);
export const T_NEEDS = bar(2);
export const T_PANEL = bar(3);
export const T_STYLES = bar(4);
/** two bars of looks, one per beat */
export const T_STATS = bar(6);
export const T_MOD = bar(7);
/** The track's final hit: the end card. */
export const T_END = bar(8);
export const DURATION = T_END + 2.35;
