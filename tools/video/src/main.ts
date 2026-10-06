// Browser entry: renders the showcase frame by frame for render.mjs.
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './fonts.css';
import { setRng } from '@app/renderer';
import { FORMATS, type FormatId } from './format';
import { buildCues } from './show/cues';
import { DURATION, Show } from './show/show';
import { FPS } from './show/time';

const q = new URLSearchParams(location.search);
const fmt = FORMATS[(q.get('format') as FormatId) in FORMATS ? (q.get('format') as FormatId) : '16x9'];

// the same random numbers every run: blinks and particles land on the same frames
let seed = 7;
setRng(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; });

const c = document.getElementById('c') as HTMLCanvasElement;
c.width = fmt.W; c.height = fmt.H;
const x = c.getContext('2d')!;
let show: Show | null = null, frame = 0;
const dt = 1 / FPS;

async function ready(): Promise<void> {
  await Promise.all([document.fonts.load('700 60px "Fredoka Variable"'), document.fonts.load('700 30px "Segoe UI"'), document.fonts.load('600 30px "DejaVu Sans Mono"')]);
  show = new Show(fmt);
  await show.ready();
  frame = 0;
}

/** Render the next frame. `png` false advances the simulation without encoding (used to seek). */
async function step(png = true): Promise<string | null> {
  await show!.prepare(frame * dt);
  show!.render(x, frame * dt, dt);
  frame++;
  return png ? c.toDataURL('image/png') : null;
}

(window as unknown as { video: unknown }).video = { width: fmt.W, height: fmt.H, fps: FPS, duration: DURATION, ready, step, get frame() { return frame; }, cues: buildCues(), durationS: DURATION };
