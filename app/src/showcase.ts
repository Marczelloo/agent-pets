// README media: the real renderer in a grid, stepped frame by frame so every recording comes out the same.
// ?mode=gallery|states|styles|dynamic|banner. tools/showcase/record.mjs calls window.showcase.step() and saves each frame.
import { pen, setRng } from './renderer';
import { PetPainter } from './renderer/painter';
import { petFor, type SceneKey } from './stage/sceneFor';
import type { Agent, Look, StyleId } from './types';

type Pet = { agent: Agent; scene: SceneKey; name?: string };
type Cell = { label: string; pets: Pet[]; look?: Partial<Look> };
type Board = { cols: number; cw: number; ch: number; u: number; gap: number; cells: Cell[] };

const pet = (agent: Agent, scene: SceneKey, name?: string): Pet => ({ agent, scene, name });
const STYLES: StyleId[] = ['sticker', 'sketch', 'clean', 'pixel', 'neon', 'ink', 'pastel'];
const STYLE_NAMES: Record<StyleId, string> = { sticker: 'Sticker', sketch: 'Sketch', clean: 'Clean', pixel: 'Pixel art', neon: 'Neon', ink: 'Ink', pastel: 'Pastel' };

const BOARDS: Record<string, Board> = {
  gallery: { cols: 5, cw: 230, ch: 185, u: 1.15, gap: 0, cells: [
    { label: 'Claude Code', pets: [pet('claude', 'edit')] },
    { label: 'Codex', pets: [pet('codex', 'web')] },
    { label: 'opencode', pets: [pet('opencode', 'bash')] },
    { label: 'GitHub Copilot', pets: [pet('copilot', 'read')] },
    { label: 'Antigravity', pets: [pet('antigravity', 'thinking')] },
    { label: 'Cursor', pets: [pet('cursor', 'grep')] },
    { label: 'Grok Build', pets: [pet('grok', 'agent')] },
    { label: 'ZCode', pets: [pet('zcode', 'done')] },
    { label: 'Any other agent', pets: [pet('other', 'needs', 'Kilo')] },
  ] },
  states: { cols: 4, cw: 240, ch: 175, u: 1.1, gap: 0, cells: ([
    ['Thinking', 'thinking'], ['Editing', 'edit'], ['Running a command', 'bash'], ['Reading', 'read'],
    ['Searching', 'grep'], ['Browsing', 'web'], ['Delegating', 'agent'], ['Needs you', 'needs'],
    ['Done', 'done'], ['Error', 'error'], ['Compacting', 'compact'], ['Asleep', 'sleep'],
  ] as [string, SceneKey][]).map(([label, scene]) => ({ label, pets: [pet('claude', scene)] })) },
  styles: { cols: 4, cw: 290, ch: 170, u: 0.9, gap: 115, cells: STYLES.map(style => ({
    label: STYLE_NAMES[style], look: { style }, pets: [pet('codex', 'thinking'), pet('claude', 'edit')],
  })) },
  dynamic: { cols: 4, cw: 260, ch: 200, u: 1.1, gap: 0, cells: ([
    ['Punch barrage', 'claude', 'edit'], ['Hand seals', 'codex', 'bash'], ['Detective', 'opencode', 'grep'],
    ['Shadow thinking', 'copilot', 'thinking'], ['Thunder dash', 'grok', 'web'], ['Summoning', 'zcode', 'agent'],
    ['Hollow Purple', 'claude', 'compact'],
  ] as [string, Agent, SceneKey][]).map(([label, agent, scene]) => ({ label, look: { motion: 'dynamic' }, pets: [pet(agent, scene)] })) },
};

// the README banner: the title on top, the whole crew at work in one row on a taskbar
type Spot = Pet & { x: number; y: number; u: number };
const CREW: Pet[] = [
  pet('claude', 'edit'), pet('grok', 'thinking'), pet('codex', 'bash'), pet('opencode', 'read'), pet('antigravity', 'grep'),
  pet('copilot', 'web'), pet('cursor', 'mcp'), pet('other', 'vibe', 'Kilo'), pet('zcode', 'podium_first'),
];
// Claude's desk and Copilot's net need more room than the others
const CREW_X = [135, 370, 522, 672, 817, 967, 1127, 1292, 1457];
const BANNER: Spot[] = CREW.map((p, i) => ({ ...p, x: CREW_X[i], y: 468, u: 1.65 }));
const BANNER_LOOK: Look = { style: 'clean', motion: 'calm' };

const q = new URLSearchParams(location.search);
const banner = q.get('mode') === 'banner';
const board = BOARDS[q.get('mode') ?? 'gallery'] ?? BOARDS.gallery;
const STRIP = 30, rows = Math.ceil(board.cells.length / board.cols);
const W = banner ? 1600 : board.cols * board.cw, H = banner ? 533 : rows * board.ch;
// ?zoom=2 draws the same board sharper, the way a high-DPI taskbar does
const Z = Number(q.get('zoom')) || 1;

// the same random numbers every run: particles and blinks land on the same frames
let seed = 7;
setRng(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; });

const c = document.getElementById('c') as HTMLCanvasElement;
const x = c.getContext('2d')!;
c.width = W * Z; c.height = H * Z;
pen.font = 'Segoe UI';
const painterFor = (p: Pet) => new PetPainter(petFor({ agent: p.agent, agent_name: p.name ?? null }, p.scene));
const painters = board.cells.map(cell => cell.pets.map(painterFor));
const bannerPainters = BANNER.map(painterFor);

const FPS = 15;
let T = 0;
function step(): string {
  const dt = 1 / FPS; T += dt;
  x.setTransform(Z, 0, 0, Z, 0, 0);
  // flat, so the GIF only stores what moves
  x.fillStyle = '#FBF1E8'; x.fillRect(0, 0, W, H);
  if (banner) return drawBanner(dt);
  board.cells.forEach((cell, i) => {
    const col = i % board.cols, row = Math.floor(i / board.cols);
    // a short last row sits in the middle
    const inRow = row === rows - 1 ? board.cells.length - row * board.cols : board.cols;
    const x0 = col * board.cw + (board.cols - inRow) * board.cw / 2, y0 = row * board.ch, base = y0 + board.ch - STRIP;
    x.fillStyle = '#1F1C1A'; x.fillRect(x0 + 10, base, board.cw - 20, STRIP - 6);
    x.fillStyle = '#E9E2DA'; x.font = '600 13px Segoe UI'; x.textAlign = 'center';
    x.fillText(cell.label, x0 + board.cw / 2, base + 17);
    x.textAlign = 'left';
    const look: Look = { style: 'sticker', motion: 'calm', ...cell.look };
    const n = cell.pets.length, cx = x0 + board.cw / 2 - board.cw * 0.12;
    painters[i].forEach((p, k) => p.frame(x, {
      dt, t0: T, X: cx + (k - (n - 1) / 2) * board.gap, Y: base, u: board.u, look, animate: true, saving: false, reduced: false, dpr: Z,
    }));
  });
  return c.toDataURL('image/png');
}

function drawBanner(dt: number): string {
  // a soft warm glow behind the crew
  const g = x.createRadialGradient(W / 2, 400, 60, W / 2, 400, 760);
  g.addColorStop(0, '#F7DDC9'); g.addColorStop(1, 'rgba(251,241,232,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.textAlign = 'center';
  x.fillStyle = '#2B2622'; x.font = '800 104px "Segoe UI Variable Display", "Segoe UI"';
  x.fillText('Agent Pets', W / 2, 118);
  x.fillStyle = '#6E655D'; x.font = '500 28px "Segoe UI Variable Display", "Segoe UI"';
  x.fillText('Pets for your coding agents, right in the Windows 11 taskbar', W / 2, 164);
  x.textAlign = 'left';
  // the taskbar they all work on
  x.fillStyle = '#1F1C1A'; x.beginPath(); x.roundRect(40, 468, W - 80, 40, 12); x.fill();
  BANNER.forEach((s, i) => bannerPainters[i].frame(x, {
    dt, t0: T, X: s.x, Y: s.y, u: s.u, look: BANNER_LOOK, animate: true, saving: false, reduced: false, dpr: Z,
  }));
  return c.toDataURL('image/png');
}

(window as unknown as { showcase: unknown }).showcase = { width: W * Z, height: H * Z, fps: FPS, step };
if (q.get('live') === '1') { const loop = () => { step(); requestAnimationFrame(loop); }; loop(); }
