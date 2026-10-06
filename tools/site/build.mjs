// Builds the landing page into one self-contained file, site/index.html: the page's own code and the app's real
// renderer (app/src) bundled inline, plus a snapshot of the GitHub releases for when the live list cannot load.
//
//   node build.mjs                        site/index.html
//   node build.mjs --watch                rebuild on every change in src/ or app/src
//   node build.mjs --body-only=<file>     also write the page without <html>/<head> (for hosts that add their own)
//   GITHUB_TOKEN=… node build.mjs         fetch the releases with a token (higher rate limit)
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const REPO = 'Marczelloo/agent-pets';
const OUT = here('../../site/index.html');
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const bodyOnly = args.find(a => a.startsWith('--body-only='))?.split('=')[1];

async function releases() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'agent-pets-site' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    // only what the page shows, so the snapshot stays small
    return list.filter(r => !r.draft).map(r => ({
      tag_name: r.tag_name, name: r.name, body: r.body ?? '', html_url: r.html_url, published_at: r.published_at, prerelease: r.prerelease,
      assets: r.assets.map(a => ({ name: a.name, size: a.size, browser_download_url: a.browser_download_url })),
    }));
  } catch (e) {
    console.warn(`releases: no snapshot (${e.message}); the page will only show the live list`);
    return [];
  }
}

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

async function build(snapshot) {
  const [html, css, js] = await Promise.all([
    readFile(here('src/page.html'), 'utf8'),
    readFile(here('src/style.css'), 'utf8'),
    esbuild.build({
      entryPoints: [here('src/main.ts')], bundle: true, format: 'iife', target: 'es2022', minify: true, write: false,
      alias: { '@app': here('../../app/src') }, legalComments: 'none', charset: 'utf8',
    }).then(r => r.outputFiles[0].text),
  ]);
  const data = json({ releases: snapshot, builtAt: new Date().toISOString(), repo: REPO });
  const page = html
    .replace('/*__CSS__*/', () => css)
    .replace('/*__DATA__*/', () => `window.__SITE__=${data};`)
    .replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, page);
  if (bodyOnly) {
    // a host that adds its own <html>/<head>: keep the head's content (title, fonts, style) at the top
    const head = page.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '');
    const body = page.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
    await writeFile(bodyOnly, head + body);
  }
  console.log(`site/index.html  ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB, ${snapshot.length} releases in the snapshot`);
}

const snapshot = await releases();
await build(snapshot);
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  let timer;
  const again = () => { clearTimeout(timer); timer = setTimeout(() => build(snapshot).catch(e => console.error(e.message)), 80); };
  fsWatch(here('src'), { recursive: true }, again);
  fsWatch(here('../../app/src'), { recursive: true }, again);
  console.log('watching src/ and app/src');
}
