import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from '../look';
import type { Look } from '../types';
import { BUBBLE_MAX_W, drawBubble, measureBubble, type BubbleKind } from './bubble';
import { recorder } from './testing';

/** Kontekst z `measureText` proporcjonalnym do długości tekstu (nagrywający zwraca stałą). */
function measuring() {
  const r = recorder();
  const ctx = new Proxy(r.ctx as unknown as Record<string, unknown>, {
    get: (t, k: string) => (k === 'measureText' ? (s: string) => ({ width: s.length * 7 }) : t[k]),
    set: (t, k: string, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log: r.log };
}

const look = (style: Look['style']): Look => ({ style, motion: 'calm' });
const KINDS: BubbleKind[] = ['question', 'action'];

describe('speech bubbles', () => {
  it('draw in every style and kind without NaN and with balanced save/restore', () => {
    for (const style of STYLE_IDS) for (const kind of KINDS) for (const dpr of [1, 1.25, 1.5]) {
      const { ctx, log } = measuring();
      const box = measureBubble(ctx, 'Edytuje App.tsx', look(style), 1);
      expect(box.w).toBeGreaterThan(0);
      drawBubble(ctx, 10.3, 4.7, 'Edytuje App.tsx', kind, look(style), box.w / 2, 1, dpr);
      const text = log.join('\n');
      expect(text, `${style} ${kind}`).not.toMatch(/NaN|Infinity/);
      const saves = log.filter(l => l.startsWith('save(')).length, restores = log.filter(l => l.startsWith('restore(')).length;
      expect(saves, `${style} ${kind}`).toBe(restores);
      expect(log.length, `${style} ${kind}`).toBeGreaterThan(3);
    }
  });

  it('pixel art uses only whole device-pixel rectangles, frame on the pixel grid', () => {
    for (const dpr of [1, 1.25, 1.5, 2]) for (const kind of KINDS) {
      const { ctx, log } = measuring();
      const box = measureBubble(ctx, 'Zgoda na Bash? npm test', look('pixel'), 1);
      drawBubble(ctx, 13.37, 2.2, 'Zgoda na Bash? npm test', kind, look('pixel'), box.w * 0.3, 1, dpr);
      const calls = log.filter(l => /^[a-zA-Z]+\(/.test(l)).map(l => l.slice(0, l.indexOf('(')));
      expect(new Set(calls)).toEqual(new Set(['save', 'restore', 'fillRect']));
      for (const l of log.filter(l => l.startsWith('fillRect('))) {
        for (const v of l.slice(9, -1).split(',').map(Number)) {
          expect(Math.abs(v * dpr - Math.round(v * dpr)), `${l} @${dpr}`).toBeLessThan(1e-3);
        }
      }
    }
  });

  it('a question is filled differently than an action', () => {
    for (const style of STYLE_IDS) {
      const fills = (kind: BubbleKind) => {
        const { ctx, log } = measuring();
        drawBubble(ctx, 0, 0, 'x', kind, look(style), 10, 1, 1);
        return log.filter(l => l.startsWith('fillStyle=')).join('|');
      };
      expect(fills('question'), style).not.toBe(fills('action'));
    }
  });

  it('grows with the text and stays within the max width for 40 chars', () => {
    for (const style of STYLE_IDS) {
      const { ctx } = measuring();
      const a = measureBubble(ctx, 'npm', look(style), 1), b = measureBubble(ctx, 'npm test --watch', look(style), 1);
      expect(b.w, style).toBeGreaterThan(a.w);
      expect(b.h, style).toBe(a.h);
      const long = measureBubble(ctx, 'W'.repeat(40), look(style), 1);
      expect(long.w, style).toBeLessThanOrEqual(BUBBLE_MAX_W);
      const big = measureBubble(ctx, 'npm', look(style), 2);
      expect(big.h, style).toBeGreaterThan(a.h);
    }
  });

  it('keeps the tail inside the bubble even when the pet is past its edge', () => {
    const { ctx, log } = measuring();
    drawBubble(ctx, 100, 0, 'abc', 'action', look('clean'), -50, 1, 1);
    const xs = log.filter(l => l.startsWith('lineTo(')).map(l => Number(l.slice(7, l.indexOf(','))));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(100);
  });
});
