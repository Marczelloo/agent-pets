// One command for the whole promo video: cues -> soundtrack -> both formats -> muxed and silent MP4s in docs/video/.
//   pnpm dev            (in another terminal: the page that draws the pets)
//   node build.mjs [--quick]     --quick renders at a lower quality to check a change fast
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const quick = process.argv.includes('--quick');
const out = resolve('out'), docs = resolve('../../docs/video');
mkdirSync(out, { recursive: true }); mkdirSync(docs, { recursive: true });
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });

console.log('1/4 cues');
run('node', ['render.mjs', '--format=16x9', `--cues=${out}/cues.json`]);
console.log('2/4 soundtrack');
run('python3', ['audio/make_audio.py', `${out}/cues.json`, `${out}/audio.wav`]);
run('python3', ['audio/normalize.py', `${out}/audio.wav`, `${out}/audio_norm.wav`]);

console.log('3/4 picture (both formats at once)');
const q = quick ? ['--crf=28', '--preset=veryfast'] : ['--crf=18', '--preset=slow'];
const jobs = ['16x9', '9x16'].map(f => new Promise((ok, fail) => {
  const p = spawn('node', ['render.mjs', `--format=${f}`, `--out=${out}/agent-pets-${f}-silent.mp4`, ...q], { stdio: 'inherit' });
  p.on('close', c => (c ? fail(new Error(`${f} render failed`)) : ok()));
}));
await Promise.all(jobs);

console.log('4/4 mux');
for (const f of ['16x9', '9x16']) {
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/agent-pets-${f}-silent.mp4`, '-i', `${out}/audio_norm.wav`, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', `${docs}/agent-pets-${f}.mp4`]);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${out}/agent-pets-${f}-silent.mp4`, '-c', 'copy', '-an', '-movflags', '+faststart', `${docs}/agent-pets-${f}-silent.mp4`]);
}
console.log('done ->', docs);
