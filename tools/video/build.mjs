// One command for the showcase: cues -> soundtrack (Running Night cut on its beat grid + effects) -> picture -> MP4 in docs/video/.
//   pnpm dev                 (in another terminal: the page that draws the video)
//   node build.mjs [--quick] [--format=16x9]
// Needs the app windows recorded once with capture.mjs and the track in music/ (see README).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const quick = process.argv.includes('--quick');
const formats = (process.argv.find(a => a.startsWith('--format=')) ?? '--format=16x9').slice(9).split(',');
const out = resolve('out'), docs = resolve('../../docs/video');
mkdirSync(out, { recursive: true }); mkdirSync(docs, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

console.log('1/4 cues');
run('node', ['render.mjs', `--format=${formats[0]}`, `--cues=${out}/cues.json`]);
console.log('2/4 soundtrack');
run('python3', ['audio/make_show_audio.py', `${out}/cues.json`, `${out}/audio.wav`]);
run('python3', ['audio/normalize.py', `${out}/audio.wav`, `${out}/audio_norm.wav`]);
console.log('3/4 picture');
const q = quick ? ['--crf=28', '--preset=veryfast'] : ['--crf=18', '--preset=slow'];
for (const f of formats) run('node', ['render.mjs', `--format=${f}`, `--out=${out}/agent-pets-${f}-silent.mp4`, ...q]);
console.log('4/4 mux');
for (const f of formats)
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/agent-pets-${f}-silent.mp4`, '-i', `${out}/audio_norm.wav`, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', `${docs}/agent-pets-${f}.mp4`]);
console.log('done ->', docs);
