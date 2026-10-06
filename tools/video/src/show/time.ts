// The showcase's clock, read off the licensed track it is cut to (Running Night, 106.01 BPM; see audio/make_show_audio.py for the cut):
//   0     - 5.62 s  59.30 - 64.92 s: its quiet breakdown, no drums, the calm intro; the drums come back on its last beat (5.05 s)
//   5.62  - 7.88 s  69.44 - 71.71 s: the last bar before the drop ("Meet the crew.")
//   7.88  - 16.94 s 71.71 - 80.76 s: the drop, as the tour starts, and its first four bars
//   16.94 - end     98.87 s to its final hit
// Every scene change lands on one of its bar lines.

export const FPS = 60;

/** The last bar before the drop. */
export const HIT = 5.62;
export const BEAT = 60 / 106.01;
export const BAR = 4 * BEAT;
/** The drums come back one beat before the bar: the crew notices, and jumps on the bar. */
export const NOTICE = HIT - BEAT;
/** Beat k counted from the hit (k = 0 .. 3 is "Meet the crew."). */
export const beat = (k: number): number => HIT + k * BEAT;
/** The tour of the app starts one bar after the hit, on the drop. */
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
