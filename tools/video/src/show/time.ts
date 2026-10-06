// The showcase's clock, read off the two licensed tracks it is cut to (see audio/make_show_audio.py for the cut itself):
//   0     - 4.93 s  Lofi Vlog, its first seven beats (87.02 BPM), the calm intro
//   4.93  - 5.62 s  the break: the lofi stops dead under a scratch, then a beat of silence
//   5.62  - 7.88 s  Running Night 51.33 s: the last bar of its quieter groove, full tempo but not yet full force (106.01 BPM)
//   7.88  - end     Running Night from 89.82 s, the start of the drop's second phrase, uncut to its final hit
// From the hit on, every scene change lands on one of Running Night's bar lines.

export const FPS = 60;

/** Lofi Vlog: beat k (0..7) of the intro. */
export const LOFI_BEAT = 60 / 87.02;
export const lofiBeat = (k: number): number => 0.104 + k * LOFI_BEAT;

/** The lofi beat where the record is stopped. */
export const SCRATCH = lofiBeat(7);
/** Running Night comes in. */
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
