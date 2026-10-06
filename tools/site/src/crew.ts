// The line-up: all nine pets in front of a height chart in pet units. Hover a pet or its table row to see it work.
import { Actor, CREW, MONO, BODY, Stage, tone } from './engine';

// what each pet shows off when woken (the README gallery's scenes)
const SHOW = ['edit', 'web', 'bash', 'read', 'thinking', 'grep', 'agent', 'done', 'needs'];
// room on the left for the chart's scale
const LEFT = 34;

export function crew(): void {
  const actors = CREW.map(c => new Actor(c.agent, 'stand', c.name ?? null));
  const rows = [...document.querySelectorAll<HTMLTableRowElement>('.agents tbody tr')];
  let hot = -1, rowHot = -1;
  let cols = 9, cellW = 0, rowH = 0, floor0 = 0, u = 1;

  const layout = (s: Stage) => {
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

  const stage = new Stage(document.querySelector('.lineup-stage')!, (s, dt, T) => {
    const x = s.x, nRows = Math.ceil(actors.length / cols);
    for (let r = 0; r < nRows; r++) {
      const fy = floor0 + rowH * r;
      // the height chart, every 20 pu
      x.font = `500 10px ${MONO}`; x.textBaseline = 'middle';
      for (let pu = 20; pu <= 100 && pu * u < rowH - 70; pu += 20) {
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
    const over = p.in ? actors.findIndex((a, i) => Math.abs(p.x - (LEFT + cellW * (i % cols + .5))) < cellW / 2 && p.y > a.y - rowH + 52 && p.y < a.y + 52) : -1;
    const want = over >= 0 ? over : rowHot;
    if (want !== hot) {
      if (hot >= 0) actors[hot].set('stand');
      if (want >= 0) { actors[want].set(SHOW[want]); actors[want].hop(200); }
      rows.forEach((r, i) => r.classList.toggle('on', i === want));
      hot = want;
    }
    actors.forEach((a, i) => {
      a.pet.gaze = p.in ? Math.max(-1, Math.min(1, (p.x - a.x) / 300)) : 0;
      a.step(dt);
      // the woken pet steps aside so its props have room
      const shift = i === hot && !['thinking', 'done', 'needs'].includes(SHOW[i]) ? -cellW * .22 : 0;
      a.x += (LEFT + cellW * (i % cols + .5) + shift - a.x) * Math.min(1, dt * 8);
      a.draw(x, dt, T, s.dpr);
      // name tag and the pet's height
      x.textAlign = 'center'; x.textBaseline = 'top';
      x.fillStyle = tone.ink; x.font = `800 ${cols === 9 ? 13 : 14}px ${BODY}`;
      const cx = LEFT + cellW * (i % cols + .5);
      x.fillText(CREW[i].label, cx, a.y + 12);
      x.fillStyle = tone['ink-2']; x.font = `500 10.5px ${MONO}`;
      x.fillText(`${CREW[i].pet} · ${Math.round(a.height / u)} pu`, cx, a.y + 31);
    });
  });
  stage.onResize = () => layout(stage);
  layout(stage);
  stage.onClick = (px, py) => { const a = actors.find(a => a.hit(px, py, 20)); if (a) a.poke('cheer', 1.4); };
  rows.forEach((r, i) => {
    r.addEventListener('pointerenter', () => { rowHot = i; });
    r.addEventListener('pointerleave', () => { if (rowHot === i) rowHot = -1; });
  });
}
