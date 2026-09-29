import type { StageBackground } from '../types';

const DEFAULT_OPACITY = { glass: 12, solid: 90 } as const;

function rgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${+a.toFixed(3)})`;

/** Whether the background is drawn (`on` controls visibility so the Move border works even without a background). */
export const bgVisible = (bg: StageBackground): boolean => bg.kind !== 'none';

/**
 * Background style behind the stage canvas. Colorless glass: white tint on a dark taskbar, black on a light one,
 * with a 1 px border at 1.5× opacity. Solid color without a selected color: a card matching taskbar brightness.
 * WebView cannot see windows beneath it, so true blur is unavailable.
 */
export function bgStyle(bg: StageBackground, lightBar: boolean): Record<string, string> {
  if (bg.kind === 'none') return { background: 'transparent', border: 'none', borderRadius: `${bg.radius}px` };
  const a = (bg.opacity ?? DEFAULT_OPACITY[bg.kind]) / 100;
  const auto: [number, number, number] = bg.kind === 'glass' ? (lightBar ? [0, 0, 0] : [255, 255, 255]) : (lightBar ? [255, 255, 255] : [32, 32, 32]);
  const c = rgb(bg.color) ?? auto;
  return {
    background: rgba(c, a),
    border: bg.kind === 'glass' ? `1px solid ${rgba(c, Math.min(1, a * 1.5))}` : 'none',
    borderRadius: `${bg.radius}px`,
  };
}
