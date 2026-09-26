import type { StageBackground } from '../types';

const DEFAULT_OPACITY = { glass: 12, solid: 90 } as const;

function rgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${+a.toFixed(3)})`;

/**
 * Styl tła za płótnem sceny. Szkło bez koloru: biały odcień na ciemnym pasku, czarny na jasnym,
 * z ramką 1 px o 1,5× większym kryciu. Pełny kolor bez wybranego koloru: karta w jasności paska.
 * WebView nie widzi okien pod sobą, więc prawdziwego rozmycia nie ma.
 */
export function bgStyle(bg: StageBackground, lightBar: boolean): Record<string, string> {
  if (bg.kind === 'none') return { display: 'none' };
  const a = (bg.opacity ?? DEFAULT_OPACITY[bg.kind]) / 100;
  const auto: [number, number, number] = bg.kind === 'glass' ? (lightBar ? [0, 0, 0] : [255, 255, 255]) : (lightBar ? [255, 255, 255] : [32, 32, 32]);
  const c = rgb(bg.color) ?? auto;
  return {
    display: 'block',
    background: rgba(c, a),
    border: bg.kind === 'glass' ? `1px solid ${rgba(c, Math.min(1, a * 1.5))}` : 'none',
    borderRadius: `${bg.radius}px`,
  };
}
