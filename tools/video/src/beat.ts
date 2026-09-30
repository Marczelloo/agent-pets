// The video's clock: 120 BPM, close to the tempo the app's own music dance uses (renderer/scenes.ts BEAT = 1.8 beats per second),
// so the pets dance in time with the soundtrack much like they do on a real taskbar.

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;

/** The cold open runs two bars and one extra beat, so HEY! (bar 3) lands at 4.5 s with the beat that enters there. */
export const INTRO_EXTRA = BEAT;

/** Time in seconds of `beat` (0-based, may be fractional) inside `bar` (1-based). */
export const at = (bar: number, beat = 0): number => (bar - 1) * BAR + beat * BEAT + (bar >= 3 ? INTRO_EXTRA : 0);

export const FPS = 60;
