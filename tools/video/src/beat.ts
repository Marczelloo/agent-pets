// The video's clock: 120 BPM, close to the tempo the app's own music dance uses (renderer/scenes.ts BEAT = 1.8 beats per second),
// so the pets dance in time with the soundtrack much like they do on a real taskbar.

export const BPM = 120;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;

/** The cold open runs two bars plus one more: knocks, HEY! at 4.5 s, a held breath, and Clawd landing on the downbeat of bar 3 at 6.0 s. */
export const INTRO_EXTRA = 4 * BEAT;
/** HEY! */
export const HEY = 4.5;

/** Time in seconds of `beat` (0-based, may be fractional) inside `bar` (1-based). */
export const at = (bar: number, beat = 0): number => (bar - 1) * BAR + beat * BEAT + (bar >= 3 ? INTRO_EXTRA : 0);

export const FPS = 60;
