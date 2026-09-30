// Browser entry: renders the story frame by frame for render.mjs. ?format=16x9|9x16
import '@fontsource-variable/fredoka';
import './fonts.css';
import { setRng } from '@app/renderer';
import { FPS } from './beat';
import { FORMATS, type FormatId } from './format';
import { buildCues, DURATION_S } from './cues';
import { DURATION, Story } from './story';

const q = new URLSearchParams(location.search);
const fmt = FORMATS[(q.get('format') as FormatId) in FORMATS ? (q.get('format') as FormatId) : '16x9'];

// the same random numbers every run: blinks and particles land on the same frames
let seed = 7;
setRng(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; });

const c = document.getElementById('c') as HTMLCanvasElement;
c.width = fmt.W; c.height = fmt.H;
const x = c.getContext('2d')!;
let story: Story | null = null, frame = 0;
const dt = 1 / FPS;

async function ready(): Promise<void> {
  await Promise.all([document.fonts.load('700 60px "Fredoka Variable"'), document.fonts.load('700 30px "Segoe UI"')]);
  story = new Story(fmt);
  frame = 0;
}

/** Render the next frame. `png` false advances the simulation without encoding (used to seek). */
function step(png = true): string | null {
  story!.render(x, frame * dt, dt);
  frame++;
  return png ? c.toDataURL('image/png') : null;
}

(window as unknown as { video: unknown }).video = { width: fmt.W, height: fmt.H, fps: FPS, duration: DURATION, ready, step, get frame() { return frame; }, cues: buildCues(), durationS: DURATION_S };
if (q.get('live') === '1') void ready().then(() => { const loop = () => { step(false); requestAnimationFrame(loop); }; loop(); });
