// The line-up: all nine pets in front of a height chart in pet units. Hover a pet or its table row to see it work.
// On a phone it is one line that a finger swipes through: the pet in the middle wakes up, its table row as a card below.
import { Actor, CREW, MONO, BODY, REDUCED, Stage, tone } from './engine';

// what each pet shows off when woken (the README gallery's scenes)
const SHOW = ['edit', 'web', 'bash', 'read', 'thinking', 'grep', 'agent', 'done', 'needs'];
// room on the left for the chart's scale
const LEFT = 34;
const PHONE = matchMedia('(max-width: 720px)');

export function crew(): void {
  const actors = CREW.map(c => new Actor(c.agent, 'stand', c.name ?? null));
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('.agents tbody tr')];
  const last = actors.length - 1;
  let hot = -1, rowHot = -1;
  let cols = 9, cellW = 0, rowH = 0, floor0 = 0, u = 1;
  // the swipeable line: `off` is the pet index at the middle (fractional while it moves), `aim` where it settles
  let swipe = false, off = 0, aim = 0, mid = 0;
  let drag: { x0: number; off0: number; t: number; o: number; v: number; moved: boolean } | null = null;
  const shifts = actors.map(() => 0);

  const layout = (s: Stage) => {
    swipe = PHONE.matches;
    if (swipe) {
      cols = 9;
      cellW = Math.max(130, Math.min(200, s.w * .47));
      rowH = s.h;
      floor0 = s.h - 60;
      u = Math.max(.6, Math.min(1.4, cellW / 125, (floor0 - 34) / 115));
      mid = LEFT + (s.w - LEFT) / 2;
      actors.forEach(a => { a.u = u; a.y = floor0; });
      return;
    }
    cols = s.w < 720 ? 3 : 9;
    const nRows = Math.ceil(actors.length / cols);
    cellW = (s.w - LEFT) / cols;
    rowH = s.h / nRows;
    u = Math.max(.5, Math.min(1.1, cellW / 128, rowH / 150));
    floor0 = rowH - 52;
    actors.forEach((a, i) => {
      a.u = u;
      a.x = LEFT + cellW * (i % cols + .5);
      a.y = floor0 + rowH * Math.floor(i / cols);
    });
  };
  /** where pet i stands when nobody has woken it */
  const home = (i: number) => swipe ? mid + (i - off) * cellW : LEFT + cellW * (i % cols + .5);

  const stage = new Stage(document.querySelector('.lineup-stage')!, (s, dt, T) => {
    const x = s.x, nRows = swipe ? 1 : Math.ceil(actors.length / cols);
    if (swipe && !drag) off += (aim - off) * (REDUCED ? 1 : Math.min(1, dt * 9));
    for (let r = 0; r < nRows; r++) {
      const fy = floor0 + rowH * r;
      // the height chart, every 20 pu
      x.font = `500 10px ${MONO}`; x.textBaseline = 'middle';
      for (let pu = 20; pu <= 100 && fy - pu * u > (swipe ? 12 : fy - rowH + 70); pu += 20) {
        const y = fy - pu * u;
        x.strokeStyle = tone.line; x.lineWidth = 1; x.setLineDash(pu % 40 ? [2, 5] : []);
        x.beginPath(); x.moveTo(LEFT, y); x.lineTo(s.w, y); x.stroke();
        x.fillStyle = tone['ink-2']; x.textAlign = 'left'; x.fillText(`${pu}`, 4, y);
      }
      x.setLineDash([]);
      x.fillStyle = tone.ink; x.fillRect(LEFT - 8, fy, s.w - LEFT + 8, 3);
      x.textAlign = 'left'; x.fillStyle = tone['ink-2']; x.fillText('pu', 4, fy + 10);
    }
    const p = s.pointer;
    let want: number;
    if (swipe) {
      // the middle pet wakes once the line has (nearly) stopped
      const near = Math.round(Math.max(0, Math.min(last, off)));
      want = !drag && Math.abs(off - aim) < .12 ? near : -1;
    } else {
      const over = p.in ? actors.findIndex((a, i) => Math.abs(p.x - home(i)) < cellW / 2 && p.y > a.y - rowH + 52 && p.y < a.y + 52) : -1;
      want = over >= 0 ? over : rowHot;
    }
    if (want !== hot) {
      if (hot >= 0) actors[hot].set('stand');
      if (want >= 0) { actors[want].set(SHOW[want]); actors[want].hop(200); }
      rows.forEach((r, i) => r.classList.toggle('on', i === want));
      hot = want;
    }
    actors.forEach((a, i) => {
      const hx = home(i);
      if (swipe && (hx < -cellW || hx > s.w + cellW)) return;
      // on a phone the others look at the one in the middle; on a desk everyone follows the mouse
      const look = swipe ? mid : p.in ? p.x : a.x;
      a.pet.gaze = Math.max(-1, Math.min(1, (look - a.x) / (swipe ? 160 : 300)));
      a.step(dt);
      // the woken pet steps aside so its props have room
      let shift = i === hot && !['thinking', 'done', 'needs'].includes(SHOW[i]) ? -cellW * (swipe ? .14 : .22) : 0;
      // on the phone its neighbours make room as well
      if (swipe && hot >= 0 && Math.abs(i - hot) === 1) shift = Math.sign(i - hot) * cellW * .2;
      // the swiped line moves with the finger at once; only the step aside eases
      shifts[i] += (shift - shifts[i]) * Math.min(1, dt * 8);
      if (swipe) a.x = hx + shifts[i];
      else a.x += (hx + shift - a.x) * Math.min(1, dt * 8);
      const fade = swipe ? Math.max(.35, 1 - Math.abs(i - off) * .4) : 1;
      a.alpha = fade;
      a.draw(x, dt, T, s.dpr);
      // name tag and the pet's height
      x.globalAlpha = fade;
      x.textAlign = 'center'; x.textBaseline = 'top';
      x.fillStyle = tone.ink; x.font = `800 ${cols === 9 && !swipe ? 13 : 14}px ${BODY}`;
      x.fillText(CREW[i].label, hx, a.y + 12);
      x.fillStyle = tone['ink-2']; x.font = `500 10.5px ${MONO}`;
      x.fillText(`${CREW[i].pet} · ${Math.round(a.height / u)} pu`, hx, a.y + 31);
      x.globalAlpha = 1;
    });
  });
  stage.onResize = () => { layout(stage); if (swipe) actors.forEach((a, i) => { a.x = home(i); }); };
  layout(stage);

  // ── the phone's line: drag, flick, arrows, dots and the card ──
  const ui = document.querySelector<HTMLElement>('.crew-ui')!;
  const dots = ui.querySelector<HTMLElement>('.crew-dots')!;
  const cards = ui.querySelector<HTMLElement>('.crew-cards')!;
  const prev = ui.querySelector<HTMLButtonElement>('.crew-prev')!, next = ui.querySelector<HTMLButtonElement>('.crew-next')!;
  // every row as a card; all of them share one grid cell, so the box is as tall as the longest and never jumps
  cards.innerHTML = rows.map((r, i) => {
    const [agent, pet, status, limits] = r.children;
    const note = agent.querySelector('small')?.textContent ?? '';
    return `<article class="crew-card" data-i="${i}">
      <header><b>${agent.firstChild!.textContent!.trim()}</b>${status.innerHTML}</header>
      ${note ? `<small>${note}</small>` : ''}
      <dl><dt>Pet</dt><dd>${pet.innerHTML}</dd><dt>Limits</dt><dd>${limits.innerHTML}</dd></dl>
    </article>`;
  }).join('');
  dots.innerHTML = CREW.map((c, i) => `<button type="button" aria-label="${c.label}"><i></i></button>`).join('');
  const dotEls = [...dots.children] as HTMLButtonElement[], cardEls = [...cards.children] as HTMLElement[];
  let shown = -1;
  const show = (i: number) => {
    if (i === shown) return;
    shown = i;
    dotEls.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
    cardEls.forEach((c, k) => c.classList.toggle('on', k === i));
    prev.disabled = i === 0; next.disabled = i === last;
  };
  const go = (i: number) => { aim = Math.max(0, Math.min(last, i)); show(aim); };
  go(0);
  prev.addEventListener('click', () => go(aim - 1));
  next.addEventListener('click', () => go(aim + 1));
  dotEls.forEach((d, i) => d.addEventListener('click', () => go(i)));

  let dragged = false;
  const canvas = stage.canvas;
  canvas.addEventListener('pointerdown', e => {
    if (!swipe || e.button) return;
    drag = { x0: e.clientX, off0: off, t: e.timeStamp, o: off, v: 0, moved: false };
    dragged = false;
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) > 8) { drag.moved = true; try { canvas.setPointerCapture(e.pointerId); } catch { /* already gone */ } }
    if (!drag.moved) return;
    // past either end the line gives way only a little
    const raw = drag.off0 - dx / cellW;
    off = raw < 0 ? raw * .3 : raw > last ? last + (raw - last) * .3 : raw;
    const dt = Math.max(1, e.timeStamp - drag.t) / 1000;
    drag.v = drag.v * .6 + (off - drag.o) / dt * .4; drag.o = off; drag.t = e.timeStamp;
    show(Math.round(Math.max(0, Math.min(last, off))));
  });
  const release = () => {
    if (!drag) return;
    // a flick carries on a little further
    if (drag.moved) { dragged = true; go(Math.round(off + Math.max(-2, Math.min(2, drag.v * .18)))); }
    drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  stage.onClick = (px, py) => {
    if (dragged) { dragged = false; return; }
    const i = actors.findIndex(a => !a.hidden && a.hit(px, py, 20));
    // on the phone a tap on a neighbour brings it to the middle
    if (swipe && i >= 0 && i !== aim) { go(i); return; }
    if (i >= 0) actors[i].poke('cheer', 1.4);
  };
  rows.forEach((r, i) => {
    r.addEventListener('pointerenter', () => { rowHot = i; });
    r.addEventListener('pointerleave', () => { if (rowHot === i) rowHot = -1; });
  });
}
