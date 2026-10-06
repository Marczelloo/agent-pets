// Takes the README window screenshots (panel, wizard, settings) from the dev server's demo data with headless Edge.
// Start the dev server first (pnpm --dir app dev), then: node screens.mjs [panel|wizard|settings ...] [--url=http://localhost:1420] [--scheme=dark|light]
import { chromium } from 'playwright-core';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../docs/images');
const args = process.argv.slice(2);
const url = (args.find(a => a.startsWith('--url=')) ?? '--url=http://localhost:1420').slice(6);
const scheme = (args.find(a => a.startsWith('--scheme=')) ?? '--scheme=dark').slice(9);
const modes = args.filter(a => !a.startsWith('--'));

// css pixels; the files come out at twice this size
const SHOTS = {
  panel: { path: 'panel.html?lang=en', size: { width: 400, height: 500 } },
  wizard: { path: 'settings.html?wizard&lang=en#', size: { width: 760, height: 520 }, steps: 3 },
  settings: { path: 'settings.html?lang=en#look', size: { width: 900, height: 600 } },
};

const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const mode of modes.length ? modes : Object.keys(SHOTS)) {
    const shot = SHOTS[mode];
    const page = await browser.newPage({ viewport: shot.size, deviceScaleFactor: 2, colorScheme: scheme });
    await page.goto(`${url}/${shot.path}`);
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < (shot.steps ?? 0); i++) await page.getByRole('button', { name: /^(Next|Dalej)$/ }).click();
    await page.waitForTimeout(1500);
    const png = join(out, `${mode}.png`);
    await page.screenshot({ path: png });
    await page.close();
    console.log(png);
  }
} finally {
  await browser.close();
}
