// Renders the video from the running dev server (`pnpm dev`) with headless Chromium and pipes frames into ffmpeg.
//   node render.mjs --format=16x9 [--to=8.9] [--grab=0,1.5,3] [--out=out/name.mp4] [--sheet=out/sheet.png]
// --grab saves single PNG frames (seconds) for review; --out encodes an H.264 video (silent unless --audio is given).
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const format = args.format ?? '16x9';
const url = args.url ?? 'http://127.0.0.1:1421';
const chrome = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const grab = (args.grab ?? '').split(',').filter(Boolean).map(Number);
const outDir = resolve(args.dir ?? 'out');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) console.log('[page]', m.text()); });
page.on('pageerror', e => { console.log('[pageerror]', e.message); process.exitCode = 1; });
await page.goto(`${url}/index.html?format=${format}`);
await page.waitForFunction(() => 'video' in window, null, { timeout: 60000 });
await page.evaluate(() => window.video.ready());
const { width, height, fps, duration } = await page.evaluate(() => ({ width: window.video.width, height: window.video.height, fps: window.video.fps, duration: window.video.duration }));
if (args.cues) {
  // the sound cues come from the same constants as the animation
  const cues = await page.evaluate(() => ({ cues: window.video.cues, duration: window.video.durationS }));
  mkdirSync(dirname(resolve(args.cues)), { recursive: true });
  writeFileSync(resolve(args.cues), JSON.stringify(cues, null, 1));
  console.log('wrote', args.cues, `(${cues.cues.length} cues)`);
  if (!args.out && !args.grab && !args.to) { await browser.close(); process.exit(0); }
}
const to = Math.min(duration, Number(args.to ?? duration));
const total = Math.round(to * fps);
console.log(`${format} ${width}x${height} @${fps} fps, ${to.toFixed(2)} s, ${total} frames`);

let ff = null;
if (args.out) {
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-'];
  if (args.audio) ffArgs.push('-i', resolve(args.audio));
  ffArgs.push('-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', args.preset ?? 'slow', '-crf', args.crf ?? '17',
    '-tune', 'animation', '-profile:v', 'high', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-movflags', '+faststart');
  if (args.audio) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  ffArgs.push(resolve(args.out));
  ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
}

const grabFrames = new Map(grab.map(t => [Math.round(t * fps), t]));
const files = [];
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  const wantPng = ff || grabFrames.has(i);
  const data = await page.evaluate(p => window.video.step(p), !!wantPng);
  if (data) {
    const buf = Buffer.from(data.split(',')[1], 'base64');
    if (grabFrames.has(i)) { const f = `${outDir}/${format}_${(grabFrames.get(i)).toFixed(2).padStart(6, '0')}.png`; writeFileSync(f, buf); files.push(f); }
    if (ff && !ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  if (i % 300 === 299) console.log(`  ${i + 1}/${total} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
if (ff) { ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log('wrote', args.out); }
await browser.close();
if (args.sheet && files.length) {
  // --chunk=N splits a long list of grabs into several sheets: name_1.png, name_2.png ...
  const chunk = Number(args.chunk ?? files.length), sheet = resolve(args.sheet);
  for (let i = 0, n = 1; i < files.length; i += chunk, n++) {
    const out = files.length > chunk ? sheet.replace(/\.png$/, `_${n}.png`) : sheet;
    execFileSync('python3', [resolve(dirname(new URL(import.meta.url).pathname), 'tools/sheet.py'), out, args.cols ?? '3', ...files.slice(i, i + chunk)]);
    console.log('sheet', out);
  }
}
