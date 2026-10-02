import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../../settings.html', import.meta.url)), 'utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

describe('settings.html styles', () => {
  it('keeps no rules for the controls the shared kit replaced (old switch and segmented)', () => {
    expect(css).not.toMatch(/input\.switch/);
    expect(css).not.toMatch(/\.segmented/);
  });

  it('keeps the pet picker on one line instead of wrapping the last pets under the rest', () => {
    const tiles = css.match(/\.pet-tiles\{([^}]*)\}/)?.[1] ?? '';
    expect(tiles).not.toContain('flex-wrap:wrap');
    expect(tiles).toContain('overflow-x:auto');
  });

  it('lets the style gallery fit all seven cards on one row at the narrowest comfortable width', () => {
    const min = Number(css.match(/\.gallery\{[^}]*minmax\((\d+)px/)?.[1]);
    expect(7 * min + 6 * 8).toBeLessThanOrEqual(680);
    expect(css).toMatch(/\.look-card canvas\{[^}]*max-width:100%/);
  });
});
