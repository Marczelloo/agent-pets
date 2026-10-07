// The README banner, after the site's hero: the wordmark with the whole crew perched on its letters, the tagline under it
// and a Windows 11 taskbar along the bottom.
// Poses here exist only for the banner; they are added to the scene table of the showcase page, never to the app.
import { SCENES, type Scene } from './renderer';
import { PetPainter } from './renderer/painter';
import { petFor, type SceneKey } from './stage/sceneFor';
import type { Agent, Look } from './types';

const HIP_L = { ikL: 1, hxL: -47, hyL: -25 };
const hold = (base: Record<string, any>, onStart?: (c: any) => void): Scene => ({ base, acts: [['poses for the banner', 99, () => ({}), onStart]] });

const BANNER_SCENES: Record<string, Scene> = {
  b_hi: hold({ armR: 2.3, oscR: .55, _f: 11, ...HIP_L, look: 0, ex: -.2, happy: .6 }),
  b_vibe: hold({ happy: .8, look: -.2, _phones: 1, armL: .5, armR: .5 }),
  b_clap: hold({ ikL: 1, hxL: -3, hyL: -26, ikR: 1, hxR: 3, hyR: -26, happy: .9, look: -.2 }),
  b_perch: hold({ sit: 1, swing: 1, look: -.25 }),
  b_perchL: hold({ sit: 1, swing: 1, look: -.25, th: -.35 }),
  b_love: hold({ happy: 1, look: -.4, ikL: 1, hxL: -14, hyL: -40, ikR: 1, hxR: 14, hyR: -40 },
    c => [[-10, -104, 13], [14, -126, 10]].forEach(([hx, hy, s]) =>
      c.parts.push({ t: '♥', x: hx, y: hy, vx: 0, vy: 0, life: 0, max: 99, s, col: 'clay' }))),
  b_cheer: hold({ armL: 2.6, armR: 2.6, oscL: .2, oscR: .2, _f: 7, happy: 1, look: -.3 }),
  b_plane: hold({ happy: 1, look: .6, ex: .8, ikR: 1, hxR: 46, hyR: -88, ...HIP_L }),
};
Object.assign(SCENES, BANNER_SCENES);

const W0 = 'Agent Pets';
// one pet per letter, as on the site: A g e n t   P e t s
const PERCHES: { agent: Agent; scene: string; name?: string; nudge?: number }[] = [
  { agent: 'grok', scene: 'b_hi' },
  { agent: 'zcode', scene: 'b_vibe' },
  { agent: 'cursor', scene: 'b_clap' },
  { agent: 'codex', scene: 'b_perch' },
  { agent: 'other', scene: 'b_perch', name: 'Any agent' },
  { agent: 'claude', scene: 'b_perchL', nudge: -.12 },
  { agent: 'copilot', scene: 'b_love' },
  { agent: 'antigravity', scene: 'b_cheer' },
  { agent: 'opencode', scene: 'b_plane' },
];
const LOOK: Look = { style: 'clean', motion: 'calm' };
const DISPLAY = 'Fredoka, "Segoe UI Variable Display", "Segoe UI"', BODY = 'Nunito, "Segoe UI"';
/** The fonts the banner draws with; the showcase page waits for them before the first frame. */
export const BANNER_FONTS = [`700 100px ${DISPLAY}`, `700 30px ${BODY}`];
const INK = '#2B2622', INK2 = '#6E6158', CLAY = '#D97757';
const SIZE = 212, BASE = 338, BAR = 470;

export function bannerDrawer(x: CanvasRenderingContext2D, W: number, H: number, Z: number) {
  const painters = PERCHES.map(p => new PetPainter(petFor({ agent: p.agent, agent_name: p.name ?? null }, p.scene as SceneKey)));
  const u = SIZE / 190;
  let spots: { X: number; Y: number }[] | null = null;
  let left = 0;

  function wordFont() { x.font = `700 ${SIZE}px ${DISPLAY}`; x.letterSpacing = `${-.035 * SIZE}px`; }

  // where each letter's top is, measured once the fonts are in
  function place() {
    wordFont();
    left = (W - x.measureText(W0).width) / 2;
    spots = [];
    for (let i = 0; i < W0.length; i++) {
      const ch = W0[i];
      if (ch === ' ') continue;
      const at = left + x.measureText(W0.slice(0, i)).width, m = x.measureText(ch);
      const p = PERCHES[spots.length];
      spots.push({ X: at + m.width * (.5 + (p.nudge ?? 0)), Y: BASE - m.actualBoundingBoxAscent + 2 * u });
    }
    x.letterSpacing = '0px';
  }

  function glow() {
    const g = x.createRadialGradient(1180, 150, 30, 1180, 150, 760);
    g.addColorStop(0, '#F7D9C2'); g.addColorStop(1, 'rgba(251,241,232,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const h = x.createRadialGradient(250, 470, 20, 250, 470, 520);
    h.addColorStop(0, 'rgba(247,217,194,.7)'); h.addColorStop(1, 'rgba(251,241,232,0)');
    x.fillStyle = h; x.fillRect(0, 0, W, H);
  }

  function words() {
    wordFont(); x.fillStyle = INK; x.textAlign = 'left';
    x.fillText(W0, left, BASE);
    x.letterSpacing = '0px';
    x.font = `700 30px ${BODY}`; x.fillStyle = INK2; x.textAlign = 'center';
    x.fillText('Your coding agents, alive on the Windows 11 taskbar', W / 2, BASE + 76);
    x.textAlign = 'left';
  }

  function taskbar() {
    x.fillStyle = '#1F1C1A'; x.beginPath(); x.roundRect(24, BAR, W - 48, 44, 14); x.fill();
    const mid = BAR + 22;
    // a few app icons in the middle, nothing branded, and the Start button
    const icons = ['#3A7BD5', CLAY, '#5DCAA5', '#EF9F27', '#8A7CF0'], n = icons.length + 1, x0 = W / 2 - (n * 40 - 14) / 2;
    x.fillStyle = '#6FA2EA';
    [[0, 0], [14, 0], [0, 14], [14, 0 + 14]].forEach(([dx, dy]) => { x.beginPath(); x.roundRect(x0 + dx, mid - 13 + dy, 12, 12, 2.5); x.fill(); });
    icons.forEach((col, i) => { x.fillStyle = col; x.beginPath(); x.roundRect(x0 + (i + 1) * 40, mid - 13, 26, 26, 7); x.fill(); });
    // the tray: chevron, Wi-Fi, speaker, clock
    x.strokeStyle = '#E9E2DA'; x.fillStyle = '#E9E2DA'; x.lineWidth = 2.2; x.lineCap = 'round';
    const tx = W - 190;
    x.beginPath(); x.moveTo(tx - 5, mid + 3); x.lineTo(tx, mid - 3); x.lineTo(tx + 5, mid + 3); x.stroke();
    [6, 11].forEach(r => { x.beginPath(); x.arc(tx + 34, mid + 7, r, -2.3, -.84); x.stroke(); });
    x.beginPath(); x.arc(tx + 34, mid + 7, 1.8, 0, 7); x.fill();
    x.beginPath(); x.moveTo(tx + 58, mid - 3); x.lineTo(tx + 62, mid - 3); x.lineTo(tx + 67, mid - 8); x.lineTo(tx + 67, mid + 8); x.lineTo(tx + 62, mid + 3); x.lineTo(tx + 58, mid + 3); x.closePath(); x.fill();
    x.beginPath(); x.arc(tx + 69, mid, 6, -.8, .8); x.stroke();
    x.font = `700 15px ${BODY}`; x.textAlign = 'right'; x.fillText('12:00', W - 48, mid + 5); x.textAlign = 'left';
  }

  function hiBubble(px: number, py: number) {
    x.fillStyle = '#FFFFFF'; x.strokeStyle = INK; x.lineWidth = 3;
    x.beginPath(); x.roundRect(px, py, 64, 40, 16); x.moveTo(px + 50, py + 38); x.lineTo(px + 58, py + 54); x.lineTo(px + 36, py + 39); x.fill(); x.stroke();
    x.fillStyle = INK; x.font = `800 22px ${BODY}`; x.textAlign = 'center'; x.fillText('hi!', px + 32, py + 28); x.textAlign = 'left';
  }

  // the paper plane opencode just threw, with a looping dotted trail
  function plane(px: number, py: number) {
    x.strokeStyle = '#C9B8A8'; x.lineWidth = 3; x.lineCap = 'round'; x.setLineDash([2, 9]);
    x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + 20, py - 50, px + 90, py - 50, px + 80, py - 10);
    x.bezierCurveTo(px + 72, py + 20, px + 40, py - 5, px + 70, py - 40); x.bezierCurveTo(px + 90, py - 62, px + 120, py - 70, px + 142, py - 72); x.stroke(); x.setLineDash([]);
    x.save(); x.translate(px + 166, py - 76); x.rotate(-.18);
    x.fillStyle = '#FFFFFF'; x.strokeStyle = INK; x.lineWidth = 3; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(26, 0); x.lineTo(-24, -14); x.lineTo(-12, 0); x.lineTo(-24, 14); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(26, 0); x.lineTo(-12, 0); x.lineTo(-16, 9); x.stroke();
    x.restore();
  }

  return (dt: number, T: number) => {
    if (!spots) place();
    glow();
    words();
    taskbar();
    painters.forEach((p, i) => p.frame(x, {
      dt, t0: T, X: spots![i].X, Y: spots![i].Y, u, look: LOOK, animate: true, saving: false, reduced: false, dpr: Z,
    }));
    hiBubble(spots![0].X - 128, spots![0].Y - 128);
    plane(spots![8].X + 40 * u, spots![8].Y - 96 * u);
  };
}
