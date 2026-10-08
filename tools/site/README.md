# Landing page

The Agent Pets landing page, built into **one self-contained file**: [`site/index.html`](../../site/index.html). Open it in a browser or put it on any static host (GitHub Pages, Netlify, a bucket); it works with nothing next to it. Next to it in `site/` are the files that crawlers and link previews fetch by URL: `favicon.ico`, `apple-touch-icon.png`, `og.png` (the 1200×630 link-preview image), `robots.txt` and, once the build knows the site's address, `sitemap.xml`.

Every pet on the page is drawn by the **app's own renderer**: skins, poses, scenes, the seven looks, Dynamic motion, speech bubbles and the limit bars come straight from `app/src` and are bundled into the file. A change to a pet in the app shows up on the page with the next build.

## What's on it

| Section | What the pets do |
|---|---|
| Hero | the whole crew perched on the letters of the wordmark, following the cursor; click one |
| Crew | a line-up in front of a height chart in pet units; hover a pet or a table row to see it work |
| States | a hook event comes in, the pet acts it out with the app's bubble and progress bar; pick a pet and a state |
| Taskbar | a busy taskbar with a subagent, "+N", limits; a music switch makes idle pets dance; the statistics podium |
| Looks | the prism: the same pets through seven stripes, one look each, the one under the cursor widens; Calm and Dynamic, with every Dynamic scene |
| Claude mod | a terminal with the `/pets` pane and a pixel Clawd above the prompt |
| Door | type an agent's name: a blob in its colour answers, and the `hook.exe report` call is written for it |
| Privacy | the pets inside "your computer", and the only two connections that leave it |
| Releases | the latest release's notes, the three newest releases and the rest behind "Show older releases" |
| Footer | the crew asleep; the one under the cursor wakes up |

The navigation is a Windows 11 taskbar docked at the bottom. A different pet, in a different look, pops out of it above the section you are reading and says a line about it.

## Hosting

The repository root has a `Dockerfile` that serves **only this page**: nginx with `site/index.html`, its icons, `og.png`, `robots.txt` (and `sitemap.xml`) and `site/nginx.conf`. Its `.dockerignore` lets nothing else into the build context (about 290 KB), so the Windows app, the Rust crates and the tooling never reach the image. A hosting dashboard that looks for a Dockerfile finds this one and nothing else to build.

```sh
docker build -t agent-pets-site .
docker run -p 8080:80 agent-pets-site      # http://localhost:8080
```

- Port **80** in the container; `GET /healthz` answers `ok` (the image's healthcheck uses it).
- Gzip (the page travels as about 95 KB), `Cache-Control: no-cache` with an ETag, so a new build shows up at once.
- A Content-Security-Policy that allows exactly what the page uses: its inline script and styles, Google Fonts, and the GitHub API for the release list.
- Without Docker, any static host works: serve `site/index.html` as is, or use `site/nginx.conf` as an nginx `server` block (change `root`).

The image serves the committed `site/index.html`; run `pnpm build` here and commit the result to change what it serves.

## Releases

The build bakes a snapshot of the GitHub releases into the page. In the browser the page then asks the GitHub API for the current list (`api.github.com/repos/Marczelloo/agent-pets/releases`, no token, cached for 10 minutes) and replaces the snapshot, so a new release shows up without rebuilding: its version on the download buttons, its installer link, its notes. When the API is out of reach or rate-limited, the snapshot stays and the page says how old it is.

## Building

Needs Node 22 and pnpm.

```sh
pnpm install
pnpm build          # writes site/index.html
pnpm watch          # rebuilds on every change in src/ or app/src
```

`SITE_URL=https://… pnpm build` sets the address the page is served from: it adds the canonical URL and `og:url`, takes the link-preview image from the site instead of the repository, and writes `sitemap.xml` and a `robots.txt` that points to it. Without it the page still has full Open Graph, X/Twitter card and JSON-LD tags. `GITHUB_TOKEN=… pnpm build` fetches the releases with a token (higher rate limit). Behind a proxy, Node's `fetch` needs `NODE_USE_ENV_PROXY=1`. `node build.mjs --body-only=<file>` also writes the page without `<html>`/`<head>`, for hosts that add their own.

```
src/page.html     the page; build.mjs fills in the CSS, the release snapshot and the script
src/style.css     colours from the README banner, Fredoka / Nunito / JetBrains Mono from Google Fonts
src/engine.ts     Actor (a pet from app/src with a drop, a hop and a squash) and Stage (a canvas on the shared clock)
src/scenes.ts     poses only this page uses, added the way the README banner adds its own
src/*.ts          one file per section
```

Pets only draw while their canvas is on screen; with *reduce motion* on, they stand still and the page skips its entrances.
