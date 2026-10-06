// The showcase's clock, read off the licensed track it is cut to (Running Night, 106.01 BPM; see audio/make_show_audio.py).
// The track plays uncut from 65.52 s, so the video's bar lines are its own. It loops four chords, one per bar: A, F#, G#, C#.
//   0     - 5.62 s  its build, the drums eased in from low (or the whole track: INTRO=volume); the drums are full at the hit
//   5.62  - 7.88 s  the riser bar before the drop (C#, "Meet the crew.")
//   7.88  - end     the drop as Clawd appears for the tour (A; the bass pushes in half a beat early, as the dive starts),
//                   on through the styles (16.94 s) to the end card (26.0 s), where it fades out
// Every scene change lands on one of its bar lines.

export const FPS = 60;

/** The last bar before the drop. */
export const HIT = 5.62;
export const BEAT = 60 / 106.01;
export const BAR = 4 * BEAT;
/** The drums come in a bar before the hit: the crew notices, nods along, and jumps on the hit. */
export const NOTICE = HIT - BAR;
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
