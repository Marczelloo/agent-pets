// The README banner: the title on the left, the crew on the right as one happy bunch on a Windows 11 taskbar.
// Poses here exist only for the banner; they are added to the scene table of the showcase page, never to the app.
import { SCENES, type Scene } from './renderer';
import { PetPainter } from './renderer/painter';
import { petFor, type SceneKey } from './stage/sceneFor';
import { SKINS } from './skins';
import type { Agent, Look } from './types';

const HIP_L = { ikL: 1, hxL: -47, hyL: -25 };
const hold = (base: Record<string, any>, onStart?: (c: any) => void): Scene => ({ base, acts: [['poses for the banner', 99, () => ({}), onStart]] });

// riders sit on their friends' heads and high-five above the middle
const FIVE = 54;
const BANNER_SCENES: Record<string, Scene> = {
  b_net: hold({ _hold: 'net', pole: .32, _poleDirect: 1, ikR: 1, hxR: 34, hyR: -58, ...HIP_L, happy: 1, look: -.8 },
    c => [[57, -119, 17], [44, -152, 13], [74, -170, 11]].forEach(([hx, hy, s]) =>
      c.parts.push({ t: '♥', x: hx, y: hy, vx: 0, vy: 0, life: 0, max: 99, s, col: 'clay' }))),
  b_plane: hold({ happy: 1, look: -.9, ex: .8, ikR: 1, hxR: 46, hyR: -88, ...HIP_L }),
  b_carry: hold({ ikL: 1, hxL: -36, hyL: -84, ikR: 1, hxR: 36, hyR: -84, happy: 1, look: -.6 }),
  b_riderR: hold({ sit: 1, swing: 1, happy: 1, tilt: .12, ikR: 1, hxR: FIVE, hyR: -80, armL: 1.2 }),
  b_riderL: hold({ sit: 1, swing: 1, happy: 1, tilt: -.12, ikL: 1, hxL: -FIVE, hyL: -80, armR: 1.2, _phones: 1 }),
  b_cheer: hold({ armL: 2.6, armR: 2.6, oscL: .2, oscR: .2, _f: 7, happy: 1, look: -.3 }),
  b_hi: hold({ armR: 2.3, oscR: .55, _f: 11, ...HIP_L, look: 0, ex: -.2 }),
  b_clap: hold({ ikL: 1, hxL: -3, hyL: -26, ikR: 1, hxR: 3, hyR: -26, happy: .9, look: -.2 }),
};
Object.assign(SCENES, BANNER_SCENES);

type Spot = { agent: Agent; scene: string; name?: string; x: number; u: number; on?: number };
const GROUND = 476, U = 1.6, UR = 1.15;
const CREW: Spot[] = [
  { agent: 'copilot', scene: 'b_net', x: 700, u: U },
  { agent: 'opencode', scene: 'b_plane', x: 825, u: U },
  { agent: 'codex', scene: 'b_carry', x: 955, u: U },
  { agent: 'claude', scene: 'b_carry', x: 1085, u: U },
  { agent: 'antigravity', scene: 'b_cheer', x: 1215, u: U },
  { agent: 'grok', scene: 'b_hi', x: 1330, u: U },
  { agent: 'cursor', scene: 'b_clap', x: 1450, u: U },
  // riders, drawn after the friend they sit on
  { agent: 'zcode', scene: 'b_riderR', x: 955, u: UR, on: 2 },
  { agent: 'other', scene: 'b_riderL', name: 'Kilo', x: 1085, u: UR, on: 3 },
];
const LOOK: Look = { style: 'clean', motion: 'calm' };
const FONT = '"Segoe UI Variable Display", "Segoe UI"';

/** Where a pet's head is, so a rider can sit on it. */
function headY(s: Spot): number {
  const sk = SKINS[petFor({ agent: s.agent, agent_name: s.name ?? null }, 'idle').type];
  return GROUND - ((sk.legLen ?? 17) - 5) * s.u - sk.height * s.u + 3;
}

export function bannerDrawer(x: CanvasRenderingContext2D, W: number, H: number, Z: number) {
  const painters = CREW.map(s => new PetPainter(petFor({ agent: s.agent, agent_name: s.name ?? null }, s.scene as SceneKey)));
  const ys = CREW.map(s => s.on == null ? GROUND : headY(CREW[s.on]));

  function taskbar() {
    x.fillStyle = '#1F1C1A'; x.beginPath(); x.roundRect(24, GROUND, W - 48, 44, 14); x.fill();
    const mid = GROUND + 22;
    // a few app icons, nothing branded
    ['#3A7BD5', '#D97757', '#5DCAA5', '#EF9F27'].forEach((col, i) => {
      x.fillStyle = col; x.beginPath(); x.roundRect(64 + i * 44, mid - 13, 26, 26, 7); x.fill();
    });
    // the tray: chevron, Wi-Fi, speaker, clock
    x.strokeStyle = '#E9E2DA'; x.fillStyle = '#E9E2DA'; x.lineWidth = 2.2; x.lineCap = 'round';
    const tx = W - 190;
    x.beginPath(); x.moveTo(tx - 5, mid + 3); x.lineTo(tx, mid - 3); x.lineTo(tx + 5, mid + 3); x.stroke();
    [6, 11].forEach(r => { x.beginPath(); x.arc(tx + 34, mid + 7, r, -2.3, -.84); x.stroke(); });
    x.beginPath(); x.arc(tx + 34, mid + 7, 1.8, 0, 7); x.fill();
    x.beginPath(); x.moveTo(tx + 58, mid - 3); x.lineTo(tx + 62, mid - 3); x.lineTo(tx + 67, mid - 8); x.lineTo(tx + 67, mid + 8); x.lineTo(tx + 62, mid + 3); x.lineTo(tx + 58, mid + 3); x.closePath(); x.fill();
    x.beginPath(); x.arc(tx + 69, mid, 6, -.8, .8); x.stroke();
    x.font = `600 15px ${FONT}`; x.textAlign = 'right'; x.fillText('12:00', W - 48, mid + 5); x.textAlign = 'left';
  }

  function title() {
    x.fillStyle = '#2B2622'; x.font = `800 100px ${FONT}`;
    x.fillText('Agent Pets', 64, 262);
    x.fillStyle = '#6E655D'; x.font = `500 29px ${FONT}`;
    x.fillText('Pets for your coding agents,', 70, 320);
    x.fillText('right in the Windows 11 taskbar', 70, 360);
  }

  function hiBubble(px: number, py: number) {
    x.fillStyle = '#FFFFFF'; x.strokeStyle = '#2B2622'; x.lineWidth = 3;
    x.beginPath(); x.roundRect(px, py, 64, 40, 16); x.moveTo(px + 14, py + 38); x.lineTo(px + 6, py + 54); x.lineTo(px + 28, py + 39); x.fill(); x.stroke();
    x.fillStyle = '#2B2622'; x.font = `800 22px ${FONT}`; x.textAlign = 'center'; x.fillText('hi!', px + 32, py + 28); x.textAlign = 'left';
  }

  // the paper plane opencode just threw, with a looping dotted trail
  function plane() {
    x.strokeStyle = '#C9B8A8'; x.lineWidth = 3; x.lineCap = 'round'; x.setLineDash([2, 9]);
    x.beginPath(); x.moveTo(902, 330); x.bezierCurveTo(890, 210, 1040, 225, 1000, 160);
    x.bezierCurveTo(975, 118, 1045, 84, 1112, 92); x.stroke(); x.setLineDash([]);
    x.save(); x.translate(1136, 95); x.rotate(-.12);
    x.fillStyle = '#FFFFFF'; x.strokeStyle = '#2B2622'; x.lineWidth = 3; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(26, 0); x.lineTo(-24, -14); x.lineTo(-12, 0); x.lineTo(-24, 14); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(26, 0); x.lineTo(-12, 0); x.lineTo(-16, 9); x.stroke();
    x.restore();
  }

  // a little burst where the riders' hands meet
  function five(px: number, py: number) {
    x.strokeStyle = '#E8A33D'; x.lineWidth = 3.5; x.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * .42;
      x.beginPath(); x.moveTo(px + Math.cos(a) * 22, py + Math.sin(a) * 22); x.lineTo(px + Math.cos(a) * 36, py + Math.sin(a) * 36); x.stroke();
    }
  }

  return (dt: number, T: number) => {
    const g = x.createRadialGradient(1080, 380, 40, 1080, 380, 620);
    g.addColorStop(0, '#F7DDC9'); g.addColorStop(1, 'rgba(251,241,232,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    title();
    taskbar();
    plane();
    CREW.forEach((s, i) => painters[i].frame(x, {
      dt, t0: T, X: s.x, Y: ys[i], u: s.u, look: LOOK, animate: true, saving: false, reduced: false, dpr: Z,
    }));
    hiBubble(1350, 250);
    five(1020, 262);
  };
}
