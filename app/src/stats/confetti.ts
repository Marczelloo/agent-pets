// Confetti over the podium (spec 0.9, 3.3): pure steps, drawing in Podium.tsx.
export interface Piece { x: number; y: number; vx: number; vy: number; rot: number; vr: number; col: string; w: number; h: number }

export const CONFETTI_MS = 2500;
const GRAVITY = 60;

/** `n` pieces above a canvas of width `w`, in `colors`, from generator `rng` (0…1). */
export function spawnConfetti(n: number, w: number, colors: string[], rng: () => number): Piece[] {
  return Array.from({ length: n }, (_, i) => ({
    x: rng() * w, y: -rng() * 60, vx: (rng() - 0.5) * 40, vy: 30 + rng() * 50,
    rot: rng() * Math.PI, vr: (rng() - 0.5) * 8, col: colors[i % colors.length], w: 4 + rng() * 2, h: 6 + rng() * 3,
  }));
}

/** Advance by `dt` s; pieces below `h` disappear. */
export function stepConfetti(parts: Piece[], dt: number, h: number): Piece[] {
  return parts
    .map(p => ({ ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt, vy: p.vy + GRAVITY * dt, rot: p.rot + p.vr * dt }))
    .filter(p => p.y < h + 10);
}

export function drawConfetti(x: CanvasRenderingContext2D, parts: Piece[]): void {
  for (const p of parts) {
    x.save();
    x.translate(p.x, p.y);
    x.rotate(p.rot);
    x.fillStyle = p.col;
    x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    x.restore();
  }
}

/** Winner's confetti colors: its agent color, gold, and white. */
export const confettiColors = (agent: string): string[] =>
  agent === 'claude' ? ['#D97757', '#E3AE3A', '#F2AE92', '#FFFFFF'] : ['#5DCAA5', '#E3AE3A', '#85B7EB', '#FFFFFF'];
