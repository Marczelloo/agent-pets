// Records the real Agent Pets windows (panel, stats, settings) from the app's own dev server in demo mode, frame by frame with a
// controlled clock, so the video can show the actual app with its live pets. Start the app's dev server first:
//   pnpm --dir ../../app exec vite --port 1420        then:  node capture.mjs [name ...]
// Writes public/ui/<name>/0000.png ... and public/ui/<name>/meta.json ({ fps, frames, width, height }).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP = process.env.APP_URL ?? 'http://127.0.0.1:1420';
const FPS = 30;
const font = readFileSync(resolve('node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2')).toString('base64');
// the app asks for Segoe UI; on Linux the closest friendly face we ship is Nunito
const FONT_CSS = ['Segoe UI', 'Segoe UI Variable Text', 'Segoe UI Variable Display']
  .map(f => `@font-face{font-family:'${f}';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:200 1000;}`).join('');

/** What to record: page, window size (css px, recorded at 2x), seconds, and timed actions. */
const SHOTS = {
  panel: { path: 'panel.html?lang=en', size: { width: 400, height: 500 }, secs: 2.6, actions: [[1.25, p => p.getByText('Limits', { exact: true }).first().click()]] },
  stats: { path: 'stats.html?lang=en', size: { width: 900, height: 640 }, secs: 2.6, pre: 60, actions: [] },
  look: { path: 'settings.html?lang=en#look', size: { width: 900, height: 600 }, secs: 2.6, actions: [] },
};

const want = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
try {
  for (const [name, s] of Object.entries(SHOTS)) {
    if (want.length && !want.includes(name)) continue;
    const dir = resolve('public/ui', name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({ viewport: s.size, deviceScaleFactor: 2, colorScheme: 'light' });
    page.on('pageerror', e => console.log(name, 'pageerror', e.message));
    // the panel's demo leaves Claude's 5-hour limit out on purpose (to show "No data"); the video shows all four bars
    await page.route('**/src/panel/main.tsx*', async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace('demoLimits(now).slice(1)', 'demoLimits(now)') }); });
    await page.clock.install({ time: new Date('2026-10-06T12:48:00') });
    await page.goto(`${APP}/${s.path}`);
    await page.addStyleTag({ content: FONT_CSS });
    await page.evaluate(() => document.fonts.ready);
    await page.clock.runFor(s.pre ?? 400);
    const n = Math.round(s.secs * FPS), acts = [...s.actions];
    for (let i = 0; i < n; i++) {
      while (acts.length && acts[0][0] <= i / FPS) await acts.shift()[1](page);
      await page.screenshot({ path: `${dir}/${String(i).padStart(4, '0')}.png` });
      await page.clock.runFor(1000 / FPS);
    }
    writeFileSync(`${dir}/meta.json`, JSON.stringify({ fps: FPS, frames: n, width: s.size.width * 2, height: s.size.height * 2 }));
    console.log(name, n, 'frames');
    await page.close();
  }
} finally { await browser.close(); }
