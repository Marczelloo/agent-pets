// The video's clock. 108 BPM is the tempo the app's own music dance uses (renderer/scenes.ts BEAT = 1.8 beats per second),
// so the pets in the video dance in time with the soundtrack the same way they do on a real taskbar.

export const BPM = 108;
export const BEAT = 60 / BPM;
export const BAR = 4 * BEAT;

/** Time in seconds of `beat` (0-based, may be fractional) inside `bar` (1-based). */
export const at = (bar: number, beat = 0): number => (bar - 1) * BAR + beat * BEAT;

export const FPS = 60;
