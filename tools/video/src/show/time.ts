// The showcase's clock, read off the two licensed tracks it is cut to (see audio/make_show_audio.py for the cut itself):
//   0     - 5.62 s  Lofi Vlog, its first two bars (87.02 BPM), the calm intro
//   5.62  - 16.94 s Running Night 69.44 - 80.76 s: one bar of build, then four bars from its drop (106.01 BPM)
//   16.94 - end     Running Night 98.87 s to its real ending: four more bars and the final hit
// The beat grid runs on unbroken through both Running Night pieces, so every scene change lands on a bar line.

export const FPS = 60;

/** Lofi Vlog: beat k (0..7) of the intro. */
export const LOFI_BEAT = 60 / 87.02;
export const lofiBeat = (k: number): number => 0.104 + k * LOFI_BEAT;

/** Running Night starts at the build bar. */
export const BUILD = 5.62;
export const BEAT = 60 / 106.01;
export const BAR = 4 * BEAT;
/** Beat k counted from the build bar (k = 4 is the drop). */
export const beat = (k: number): number => BUILD + k * BEAT;
export const DROP = beat(4);
/** Bar n counted from the drop (bar 0 starts at the drop). */
export const bar = (n: number, b = 0): number => DROP + n * BAR + b * BEAT;

/** Where each scene starts. */
export const T_STATES = bar(0);
export const T_NEEDS = bar(2);
export const T_PANEL = bar(3);
export const T_STYLES = bar(4);
export const T_STATS = bar(5);
export const T_MOD = bar(6);
export const T_CREW = bar(7);
/** The track's final hit: the end card. */
export const T_END = bar(8);
export const DURATION = T_END + 2.35;
