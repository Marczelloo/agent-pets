// Releases: the snapshot baked in at build time, replaced by the live list from the GitHub API when it loads.
import { Actor, REDUCED, Stage } from './engine';
import type { Agent } from '@app/types';

export interface Asset { name: string; size: number; browser_download_url: string }
export interface Release { tag_name: string; name: string; body: string; html_url: string; published_at: string; prerelease: boolean; assets: Asset[] }
interface SiteData { releases: Release[]; builtAt: string; repo: string; live?: boolean }

const DATA = (window as unknown as { __SITE__: SiteData }).__SITE__;
const API = `https://api.github.com/repos/${DATA.repo}/releases?per_page=100`;
const CACHE = 'agent-pets-releases';
/** height of the latest notes while folded */
const FOLDED = 380;
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
  if (first && !first.startsWith('#') && !first.startsWith('-')) return first.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const b = lines.find(l => l.startsWith('- '));
  return (b ?? '').replace(/^-\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/`/g, '');
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
      <div class="notes fold clip" id="latest-notes" style="max-height: ${FOLDED}px">${markdown(latest.body)}</div>
      <button type="button" class="more" aria-controls="latest-notes" aria-expanded="false">Show all notes</button>
    </div>
    <div class="latest-side">
      <div class="btns">
        <a class="btn primary" href="${exe ? exe.browser_download_url : latest.html_url}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/></svg>
          <span>Download <b>${esc(v)}</b>${exe ? ` · ${(exe.size / 1048576).toFixed(1)} MB` : ''}</span>
        </a>
        <a class="btn ghost" href="${latest.html_url}"><span>Release on GitHub</span></a>
      </div>
      <div class="party"><canvas class="party-stage" aria-hidden="true"></canvas></div>
    </div>`;
  const more = document.querySelector<HTMLButtonElement>('.latest .more')!, notes = document.getElementById('latest-notes')!;
  if (notes.scrollHeight <= FOLDED + 4) { notes.classList.remove('clip'); notes.style.maxHeight = 'none'; more.hidden = true; }
  more.addEventListener('click', () => {
    const opening = notes.classList.contains('clip'), full = notes.scrollHeight;
    more.setAttribute('aria-expanded', String(opening));
    more.textContent = opening ? 'Show fewer' : 'Show all notes';
    if (opening) {
      notes.classList.remove('clip');
      notes.style.maxHeight = `${full}px`;
      // free the height once open, so a narrower window can still show it all
      const done = () => { if (!notes.classList.contains('clip')) notes.style.maxHeight = 'none'; };
      notes.addEventListener('transitionend', done, { once: true });
      if (REDUCED) done();
    } else {
      notes.style.maxHeight = `${full}px`;
      void notes.offsetHeight;
      notes.classList.add('clip');
      notes.style.maxHeight = `${FOLDED}px`;
      // the page shrinks as the notes fold: follow it, so the button stays where you clicked it
      if (more.getBoundingClientRect().top < window.innerHeight) window.scrollBy({ top: -(full - FOLDED), behavior: REDUCED ? 'auto' : 'smooth' });
    }
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
  document.querySelectorAll<HTMLDetailsElement>('[data-rels] details').forEach(slide);

  src.className = `src${source === 'live' ? ' live' : ''}`;
  const legend = '<span style="color:var(--teal)">◆</span> feature · <span style="color:var(--mute)">◆</span> patch';
  src.innerHTML = source === 'live'
    ? `<i></i>live from the GitHub API · ${legend}`
    : `<i></i>snapshot from ${fmtDate(DATA.builtAt)} · ${legend} · <a href="https://github.com/${DATA.repo}/releases">all on GitHub</a>`;
}

/** <details> that slide open and shut */
function slide(d: HTMLDetailsElement): void {
  const sum = d.querySelector('summary')!, body = d.querySelector<HTMLElement>('.body')!;
  let anim: Animation | null = null;
  sum.addEventListener('click', e => {
    if (REDUCED) return;
    e.preventDefault();
    anim?.cancel();
    const opening = !d.open;
    if (opening) d.open = true;
    const h = body.scrollHeight;
    anim = body.animate(
      opening ? [{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }] : [{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: Math.min(650, 260 + h * .35), easing: 'cubic-bezier(.3, .9, .3, 1)' });
    anim.onfinish = () => { anim = null; if (!opening) d.open = false; };
  });
}

// The pets beside the latest release: a cheering row first, and one more busy row for every bit the panel grows
// (open the notes and the rest of the crew gets to work).
type Spot = [agent: Agent, scene: string];
const ROWS: Spot[][] = [
  [['codex', 'clap'], ['claude', 'done'], ['antigravity', 'cheer']],
  [['copilot', 'web']],
  [['zcode', 'vibe'], ['grok', 'wave']],
  [['opencode', 'bash']],
  [['cursor', 'grep']],
  [['other', 'read']],
  [['codex', 'thinking'], ['claude', 'vibe']],
  [['zcode', 'done']],
];
const FIRST = 150, ROW_H = 260;
let partyStage: Stage | null = null;
function party(canvas: HTMLCanvasElement): void {
  partyStage?.dispose();
  const rows: (Actor[] | null)[] = ROWS.map(() => null);
  partyStage = new Stage(canvas, (s, dt, T) => {
    const u = Math.max(.6, Math.min(1, s.w / 520));
    ROWS.forEach((spots, r) => {
      const floor = FIRST + r * ROW_H, fits = floor + 24 <= s.h;
      if (!fits) { rows[r] = null; return; }
      // a row that just found room drops in
      if (!rows[r]) rows[r] = spots.map(([agent, scene], i) => { const a = new Actor(agent, scene, agent === 'other' ? 'Any agent' : null); a.drop(220 + i * 70); return a; });
      s.x.fillStyle = 'rgba(255,255,255,.08)'; s.x.fillRect(0, floor, s.w, 2);
      // one pet with props sits left of centre, alternating sides; two or three spread out
      const xs = spots.length === 1 ? [r % 2 ? .3 : .55] : spots.length === 2 ? [.3, .7] : [.2, .5, .8];
      rows[r]!.forEach((a, i) => {
        a.u = u; a.x = s.w * xs[i]; a.y = floor;
        a.step(dt); a.draw(s.x, dt, T, s.dpr);
      });
    });
  });
  partyStage.onClick = (px, py) => { const a = rows.flatMap(r => r ?? []).find(a => a.hit(px, py, 16)); if (a) a.hop(320); };
}

export function releases(): void {
  render(DATA.releases, 'snapshot');
  // a build for a host that blocks outside requests (a preview) keeps the snapshot and asks nobody
  if (DATA.live !== false) live().then(list => { if (list && list.length) render(list, 'live'); });
}
