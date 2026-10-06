// Releases: the snapshot baked in at build time, replaced by the live list from the GitHub API when it loads.
import { Actor, Stage } from './engine';

export interface Asset { name: string; size: number; browser_download_url: string }
export interface Release { tag_name: string; name: string; body: string; html_url: string; published_at: string; prerelease: boolean; assets: Asset[] }
interface SiteData { releases: Release[]; builtAt: string; repo: string }

const DATA = (window as unknown as { __SITE__: SiteData }).__SITE__;
const API = `https://api.github.com/repos/${DATA.repo}/releases?per_page=100`;
const CACHE = 'agent-pets-releases';
// a hand-written one-liner for releases whose notes start straight with a list
const SUMMARY: Record<string, string> = {
  'v0.17.0': 'global shortcuts, pinned sessions, limit forecasts and quieter notifications',
};

// ───────── markdown, just what the release notes use ─────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}
export function markdown(md: string): string {
  const out: string[] = [];
  const stack: number[] = [];
  let para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const closeTo = (depth: number) => { while (stack.length > depth) { out.push('</li></ul>'); stack.pop(); } };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    const h = line.match(/^#{1,6}\s+(.*)$/);
    const li = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (h) { flushPara(); closeTo(0); out.push(`<h4>${inline(h[1])}</h4>`); }
    else if (li) {
      flushPara();
      const depth = Math.floor(li[1].length / 2) + 1;
      if (depth > stack.length) { out.push('<ul><li>'); stack.push(depth); }
      else { closeTo(depth); out.push('</li><li>'); }
      out.push(inline(li[2]));
    } else if (!line.trim()) { flushPara(); }
    else if (stack.length) out.push(' ' + inline(line.trim()));
    else para.push(line.trim());
  }
  flushPara(); closeTo(0);
  return out.join('');
}

// ───────── data ─────────
const version = (r: Release) => r.tag_name.replace(/^v/, '');
const installer = (r: Release) => r.assets.find(a => /setup\.exe$/i.test(a.name));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const daysAgo = (iso: string) => { const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
const isPatch = (r: Release) => !/\.0$/.test(version(r));

/** the release's own one-line lead, else its first bullet */
function lead(r: Release): string {
  const lines = r.body.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  if (first && !first.startsWith('#') && !first.startsWith('-')) return first;
  const b = lines.find(l => l.startsWith('- '));
  return (b ?? '').replace(/^-\s+/, '').replace(/\*\*/g, '').replace(/`/g, '');
}

function counts(body: string): [string, number][] {
  const res: [string, number][] = [];
  let cur: string | null = null, n = 0;
  for (const line of body.replace(/\r/g, '').split('\n')) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) { if (cur && n) res.push([cur, n]); cur = h[1].trim(); n = 0; }
    else if (cur && /^[-*]\s/.test(line)) n++;
  }
  if (cur && n) res.push([cur, n]);
  return res;
}

async function live(): Promise<Release[] | null> {
  try {
    const hit = sessionStorage.getItem(CACHE);
    if (hit) { const c = JSON.parse(hit); if (Date.now() - c.at < 10 * 60e3) return c.list; }
  } catch { /* storage may be off */ }
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(API, { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } });
    clearTimeout(t);
    if (!res.ok) return null;
    const list = (await res.json() as Release[]).filter(r => !(r as unknown as { draft: boolean }).draft);
    try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), list })); } catch { /* fine */ }
    return list;
  } catch { return null; }
}

// ───────── page ─────────
let celebrate: Actor[] = [];

function render(list: Release[], source: 'live' | 'snapshot'): void {
  const sorted = [...list].filter(r => !r.prerelease).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  const latest = sorted[0];
  const src = document.querySelector<HTMLElement>('[data-rel-src]')!;
  if (!latest) { src.textContent = 'The release list could not be loaded. See GitHub.'; return; }
  const v = version(latest), exe = installer(latest);

  // everything on the page that names the version
  document.querySelectorAll<HTMLElement>('[data-version]').forEach(e => { e.textContent = v; });
  document.querySelectorAll<HTMLElement>('[data-tray-ver]').forEach(e => { e.textContent = `v${v}`; });
  document.querySelectorAll<HTMLAnchorElement>('a[data-download]').forEach(a => { if (exe) a.href = exe.browser_download_url; });
  document.querySelectorAll<HTMLElement>('[data-asset]').forEach(e => { if (exe) e.textContent = exe.name; });
  const news = document.querySelector<HTMLElement>('[data-news]');
  if (news) news.innerHTML = `New in <b>${esc(v)}</b>: ${esc(SUMMARY[latest.tag_name] ?? lead(latest).replace(/\.$/, ''))} →`;

  const first = sorted[sorted.length - 1];
  document.querySelector('[data-rel-title]')!.textContent = `What's new in ${v}`;
  document.querySelector('[data-rel-sub]')!.textContent =
    `${sorted.length} releases since ${fmtDate(first.published_at)}. Installers are signed for the in-app updater, which picks up each one by itself.`;

  const c = counts(latest.body);
  document.querySelector<HTMLElement>('[data-latest]')!.innerHTML = `
    <div class="latest-main">
      <div class="latest-top">
        <span class="latest-ver">${esc(v)}</span>
        <span class="latest-tag">Latest</span>
        <span class="latest-date">${fmtDate(latest.published_at)} · ${daysAgo(latest.published_at)}</span>
      </div>
      ${c.length ? `<div class="counts">${c.map(([k, n]) => `<span><b>${n}</b> ${esc(k.toLowerCase())}</span>`).join('')}</div>` : ''}
      <div class="notes clip" id="latest-notes">${markdown(latest.body)}</div>
      <button type="button" class="more" aria-controls="latest-notes" aria-expanded="false">Show all notes</button>
    </div>
    <div class="latest-side">
      <canvas class="party-stage" aria-hidden="true"></canvas>
      <div class="btns">
        <a class="btn primary" href="${exe ? exe.browser_download_url : latest.html_url}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/></svg>
          <span>Download <b>${esc(v)}</b>${exe ? ` · ${(exe.size / 1048576).toFixed(1)} MB` : ''}</span>
        </a>
        <a class="btn ghost" href="${latest.html_url}"><span>Release on GitHub</span></a>
      </div>
    </div>`;
  const more = document.querySelector<HTMLButtonElement>('.latest .more')!, notes = document.getElementById('latest-notes')!;
  if (notes.scrollHeight <= notes.clientHeight + 4) { notes.classList.remove('clip'); more.hidden = true; }
  more.addEventListener('click', () => {
    const open = notes.classList.toggle('clip');
    more.setAttribute('aria-expanded', String(!open));
    more.textContent = open ? 'Show all notes' : 'Show fewer';
  });
  party(document.querySelector('.party-stage')!);

  document.querySelector<HTMLElement>('[data-rels]')!.innerHTML = sorted.map(r => {
    const e = installer(r);
    return `<li><details>
      <summary style="--c: var(${isPatch(r) ? '--mute' : '--teal'})"><span class="v">${esc(version(r))}</span><span class="t">${esc(lead(r))}</span><span class="d">${new Date(r.published_at).toISOString().slice(0, 10)}</span></summary>
      <div class="body"><div class="notes">${markdown(r.body)}</div>
        <p class="links"><a href="${r.html_url}">Release page →</a>${e ? `<a href="${e.browser_download_url}">${esc(e.name)}</a>` : ''}</p></div>
    </details></li>`;
  }).join('');

  src.className = `src${source === 'live' ? ' live' : ''}`;
  const legend = '<span style="color:var(--teal)">◆</span> feature · <span style="color:var(--mute)">◆</span> patch';
  src.innerHTML = source === 'live'
    ? `<i></i>live from the GitHub API · ${legend}`
    : `<i></i>snapshot from ${fmtDate(DATA.builtAt)} · ${legend} · <a href="https://github.com/${DATA.repo}/releases">all on GitHub</a>`;
}

/** three pets cheering the latest release */
let partyStage: Stage | null = null;
function party(canvas: HTMLCanvasElement): void {
  partyStage?.dispose();
  celebrate = [new Actor('codex', 'clap'), new Actor('claude', 'done'), new Actor('antigravity', 'cheer')];
  celebrate.forEach((a, i) => a.drop(200 + i * 60));
  partyStage = new Stage(canvas, (s, dt, T) => {
    const u = Math.max(.7, Math.min(1.15, s.w / 400)), floor = s.h * .62;
    s.x.fillStyle = 'rgba(255,255,255,.08)'; s.x.fillRect(0, floor, s.w, 2);
    celebrate.forEach((a, i) => {
      a.u = u; a.x = s.w * (.22 + i * .28); a.y = floor;
      a.step(dt); a.draw(s.x, dt, T, s.dpr);
    });
  });
  partyStage.onClick = (px, py) => { const a = celebrate.find(a => a.hit(px, py, 16)); if (a) a.hop(320); };
}

export function releases(): void {
  render(DATA.releases, 'snapshot');
  live().then(list => { if (list && list.length) render(list, 'live'); });
}
