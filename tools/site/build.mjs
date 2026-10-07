// Builds the landing page into one self-contained file, site/index.html: the page's own code and the app's real
// renderer (app/src) bundled inline, plus a snapshot of the GitHub releases for when the live list cannot load.
//
//   node build.mjs                        site/index.html
//   node build.mjs --watch                rebuild on every change in src/ or app/src
//   node build.mjs --body-only=<file>     also write the page without <html>/<head> and without live requests
//                                         (for a preview host that adds its own document and blocks other sites)
//   GITHUB_TOKEN=… node build.mjs         fetch the releases with a token (higher rate limit)
import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const REPO = 'Marczelloo/agent-pets';
const OUT = here('../../site/index.html');
// Where the page is hosted, without a trailing slash. Empty: no canonical URL and no sitemap, and the link-preview
// image comes from the repository (site/og.png on main) instead of the host.
const SITE_URL = process.env.SITE_URL ?? '';
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

const attr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const TITLE = 'Agent Pets';
const BLURB = 'Your coding agents, alive on the Windows 11 taskbar: animated pets that show what Claude Code, Codex, Copilot, Cursor and other agents are doing.';

// link previews (Open Graph, X/Twitter), the canonical URL and structured data for search engines
function seoTags(snapshot) {
  const image = SITE_URL ? `${SITE_URL}/og.png` : `https://raw.githubusercontent.com/${REPO}/main/site/og.png`;
  const alt = 'The Agent Pets wordmark with the whole crew of pets perched on its letters, above a Windows 11 taskbar';
  const latest = snapshot.find(r => !r.prerelease);
  const meta = (k, v, key = 'property') => `<meta ${key}="${k}" content="${attr(v)}">`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: TITLE, description: BLURB, applicationCategory: 'DeveloperApplication', operatingSystem: 'Windows 11',
    image, url: SITE_URL || `https://github.com/${REPO}`, downloadUrl: `https://github.com/${REPO}/releases/latest`,
    ...(latest && { softwareVersion: latest.tag_name.replace(/^v/, ''), datePublished: latest.published_at.slice(0, 10) }),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    license: 'https://www.gnu.org/licenses/gpl-3.0.html',
    author: { '@type': 'Person', name: 'Marczelloo', url: 'https://github.com/Marczelloo' },
    sameAs: [`https://github.com/${REPO}`],
  };
  return [
    SITE_URL && `<link rel="canonical" href="${attr(SITE_URL)}/">`,
    meta('og:type', 'website'), meta('og:site_name', TITLE), meta('og:locale', 'en_US'),
    SITE_URL && meta('og:url', `${SITE_URL}/`),
    meta('og:title', TITLE), meta('og:description', BLURB),
    meta('og:image', image), meta('og:image:type', 'image/png'), meta('og:image:width', 1200), meta('og:image:height', 630),
    meta('og:image:alt', alt),
    meta('twitter:card', 'summary_large_image', 'name'), meta('twitter:title', TITLE, 'name'),
    meta('twitter:description', BLURB, 'name'), meta('twitter:image', image, 'name'), meta('twitter:image:alt', alt, 'name'),
    `<script type="application/ld+json">${json(ld)}</script>`,
  ].filter(Boolean).join('\n');
}

async function writeSitemap(builtAt) {
  if (!SITE_URL) return;
  await writeFile(here('../../site/sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc><lastmod>${builtAt.slice(0, 10)}</lastmod></url>
</urlset>
`);
  await writeFile(here('../../site/robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

async function build(snapshot) {
  const [html, css, js] = await Promise.all([
    readFile(here('src/page.html'), 'utf8'),
    readFile(here('src/style.css'), 'utf8'),
    esbuild.build({
      entryPoints: [here('src/main.ts')], bundle: true, format: 'iife', target: 'es2022', minify: true, write: false,
      alias: { '@app': here('../../app/src') }, legalComments: 'none', charset: 'utf8',
    }).then(r => r.outputFiles[0].text),
  ]);
  const builtAt = new Date().toISOString();
  const seo = seoTags(snapshot);
  // `live: false` keeps the page from asking the GitHub API (for hosts whose policy would refuse the request)
  const make = (live) => html
    .replace('<!--__SEO__-->', () => seo)
    .replace('/*__CSS__*/', () => css)
    .replace('/*__DATA__*/', () => `window.__SITE__=${json({ releases: snapshot, builtAt, repo: REPO, live })};`)
    .replace('/*__JS__*/', () => js.replace(/<\/script/gi, '<\\/script'));
  const page = make(true);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, page);
  await writeSitemap(builtAt);
  if (bodyOnly) {
    // a host that adds its own <html>/<head>: keep the head's content (title, fonts, style) at the top
    const other = make(false);
    const head = other.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '');
    const body = other.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
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
