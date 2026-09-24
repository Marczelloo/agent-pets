import type { Limit, Session } from '../types';
import { BADGE_W } from './layout';

export const AGENT_COLOR: Record<string, string> = { claude: '#D97757', codex: '#5DCAA5' };
const TRACK = 'rgba(128,128,128,0.30)';
const HOT = '#E24B4A';
const ACTIVE = new Set(['thinking', 'working', 'compacting', 'needs_you']);

export const clampPct = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);

export function progressFraction(p: Session['progress']): number | null {
  if (!p || !(p.total > 0)) return null;
  return Math.min(1, Math.max(0, p.done / p.total));
}

/** Pasek postępu pod zwierzakiem: 28×2 px; bez listy zadań pulsuje, gdy sesja pracuje. */
export function drawProgress(x: CanvasRenderingContext2D, cx: number, y: number, s: Session, t: number): void {
  const col = AGENT_COLOR[s.agent] ?? AGENT_COLOR.claude;
  const f = progressFraction(s.progress);
  x.save();
  x.fillStyle = TRACK;
  x.fillRect(cx - 14, y, 28, 2);
  if (f != null) {
    x.fillStyle = col;
    x.fillRect(cx - 14, y, 28 * f, 2);
  } else if (ACTIVE.has(s.state)) {
    x.globalAlpha = .25 + .45 * (.5 + .5 * Math.sin(t * 4));
    x.fillStyle = col;
    x.fillRect(cx - 14, y, 28, 2);
  }
  x.restore();
}

export interface LimitBar { agent: 'claude' | 'codex'; window: 'five_hour' | 'weekly'; pct: number }

export function limitBars(limits: Limit[]): LimitBar[] {
  const out: LimitBar[] = [];
  for (const agent of ['claude', 'codex'] as const) for (const window of ['five_hour', 'weekly'] as const) {
    const l = limits.find(v => v.agent === agent && v.window === window);
    if (l && Number.isFinite(l.used_pct)) out.push({ agent, window, pct: clampPct(l.used_pct) });
  }
  return out;
}

/** Pionowe paski 3 px: 5h pełnym kolorem, tydzień przygaszony; grupy agentów rozdziela większy odstęp. */
export function drawLimits(x: CanvasRenderingContext2D, lx: number, h: number, bars: LimitBar[]): void {
  const top = 8, H = h - 16;
  let px = lx + 3;
  let prev: string | null = null;
  for (const b of bars) {
    if (prev && prev !== b.agent) px += 3;
    x.save();
    x.fillStyle = TRACK;
    x.fillRect(px, top, 3, H);
    x.globalAlpha = b.window === 'weekly' ? .6 : 1;
    x.fillStyle = b.pct >= 90 ? HOT : AGENT_COLOR[b.agent];
    const fh = H * b.pct / 100;
    x.fillRect(px, top + H - fh, 3, fh);
    x.restore();
    px += 5;
    prev = b.agent;
  }
}

export function drawBadge(x: CanvasRenderingContext2D, bx: number, h: number, hidden: number, font: string): void {
  const w = BADGE_W - 4, hh = 16, y = (h - hh) / 2;
  x.save();
  x.fillStyle = 'rgba(128,128,128,0.35)';
  x.beginPath();
  x.roundRect(bx + 2, y, w, hh, 5);
  x.fill();
  x.fillStyle = '#FAF9F5';
  x.font = `600 10px ${font}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(`+${hidden}`, bx + 2 + w / 2, y + hh / 2 + .5);
  x.restore();
}
