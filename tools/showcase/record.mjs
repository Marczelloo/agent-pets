// Records the README GIFs from app/showcase.html with headless Edge and ffmpeg.
// Start the dev server first (pnpm --dir app dev), then: node record.mjs [mode ...] [--url=http://localhost:1420] [--zoom=2] [--stills=dir]
// `banner` is a still: one frame saved as banner.png, always at twice the size.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../docs/images');
const args = process.argv.slice(2);
const zoom = (args.find(a => a.startsWith('--zoom=')) ?? '--zoom=1').slice(7);
const url = (args.find(a => a.startsWith('--url=')) ?? '--url=http://localhost:1420').slice(6);
const all = { gallery: 'pets', states: 'states', styles: 'styles', dynamic: 'dynamic' };
const modes = args.filter(a => !a.startsWith('--'));
// 5 s at the page's 15 fps
const WARMUP = 30, FRAMES = 75;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const mode of modes.length ? modes : Object.keys(all)) {
    const page = await browser.newPage();
    await page.goto(`${url}/showcase.html?mode=${mode}&zoom=${mode === 'banner' ? 2 : zoom}`);
    await page.waitForFunction(() => 'showcase' in window);
    await page.evaluate(n => document.fonts.ready.then(() => { for (let i = 0; i < n; i++) window.showcase.step(); }), WARMUP);
    if (mode === 'banner') {
      const raw = join(mkdtempSync(join(tmpdir(), 'showcase-banner-')), 'raw.png'), png = join(out, 'banner.png');
      writeFileSync(raw, Buffer.from((await page.evaluate(() => window.showcase.step())).split(',')[1], 'base64'));
      // the canvas saves a loose PNG; this one is about half the size
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-pred', 'mixed', '-compression_level', '100', png]);
      rmSync(dirname(raw), { recursive: true, force: true });
      await page.close();
      console.log(png);
      continue;
    }
    const dir = mkdtempSync(join(tmpdir(), `showcase-${mode}-`));
    for (let i = 0; i < FRAMES; i++) {
      const data = await page.evaluate(() => window.showcase.step());
      writeFileSync(join(dir, `f${String(i).padStart(3, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    const fps = await page.evaluate(() => window.showcase.fps);
    const gif = join(out, `${all[mode] ?? mode}.gif`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%03d.png'),
      '-vf', 'split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', '-loop', '0', gif]);
    // --stills=<dir> keeps the first frame, handy for checking the layout
    const stills = args.find(a => a.startsWith('--stills='))?.slice(9);
    if (stills) { mkdirSync(stills, { recursive: true }); copyFileSync(join(dir, 'f000.png'), join(stills, `${mode}.png`)); }
    rmSync(dir, { recursive: true, force: true });
    await page.close();
    console.log(gif);
  }
} finally {
  await browser.close();
}
