// Privacy, drawn: the pets work inside your computer; only two lines ever leave it.
import { Actor, BODY, MONO, Stage, tone } from './engine';

export function privacy(): void {
  const pets = [new Actor('claude', 'thinking'), new Actor('codex', 'read'), new Actor('opencode', 'sleep')];
  new Stage(document.querySelector('.priv-stage')!, (s, dt, T) => {
    const x = s.x, narrow = s.w < 460;
    const bw = s.w * (narrow ? .62 : .64), top = 26, bh = s.h - top - 8, floor = top + bh - 26;
    // your computer
    x.strokeStyle = tone.ink; x.lineWidth = 2; x.setLineDash([6, 6]);
    x.beginPath(); x.roundRect(1, top, bw, bh, 18); x.stroke(); x.setLineDash([]);
    x.fillStyle = tone.ink; x.font = `800 13px ${BODY}`; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    x.fillText('your computer', 14, top - 9);
    if (!narrow) {
      x.fillStyle = tone['ink-2']; x.font = `500 11px ${MONO}`; x.textAlign = 'right';
      x.fillText('127.0.0.1 + token', bw - 12, top - 9);
    }
    const u = Math.max(.5, Math.min(.8, bw / 380));
    pets.forEach((p, i) => {
      p.u = u; p.x = 1 + bw * (i + .5) / 3; p.y = floor;
      p.step(dt); p.draw(x, dt, T, s.dpr);
    });
    // the only two ways out
    const ends: [string, string, boolean][] = [['github.com', 'update check', false], ['api.anthropic.com', 'opt-in limits', true]];
    ends.forEach(([host, what, opt], i) => {
      const y = top + bh * (i ? .7 : .3), x1 = bw + 2, x2 = s.w - 4;
      x.strokeStyle = opt ? tone['ink-2'] : tone.clay; x.lineWidth = 2; x.setLineDash(opt ? [3, 5] : []);
      const dash = (T * 30) % 16;
      x.lineDashOffset = opt ? -dash : 0;
      x.beginPath(); x.moveTo(x1, y); x.lineTo(x2 - 8, y); x.stroke(); x.setLineDash([]); x.lineDashOffset = 0;
      x.fillStyle = x.strokeStyle; x.beginPath(); x.moveTo(x2, y); x.lineTo(x2 - 9, y - 5); x.lineTo(x2 - 9, y + 5); x.fill();
      x.textAlign = 'right'; x.fillStyle = tone.ink; x.font = `600 ${narrow ? 10 : 11}px ${MONO}`;
      x.fillText(host, x2, y - 10);
      x.fillStyle = tone['ink-2']; x.font = `500 ${narrow ? 10 : 11}px ${BODY}`;
      x.fillText(what, x2, y + 18);
    });
  });
}
