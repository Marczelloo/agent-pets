import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../../settings.html', import.meta.url)), 'utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

describe('settings.html styles', () => {
  it('keeps no rules for the controls the shared kit replaced (old switch and segmented)', () => {
    expect(css).not.toMatch(/input\.switch/);
    expect(css).not.toMatch(/\.segmented/);
  });

  it('lays the pet picker out in balanced rows, never leaving the last pets alone under the rest', () => {
    // nine pets: 3 × 3 when narrow, 5 + 4 when there is room; never an auto-fill that strands one or two
    expect(css).toMatch(/\.pet-tiles\{[^}]*grid-template-columns:repeat\(3,/);
    expect(css).toMatch(/@container \(min-width:\d+px\)\{\.pet-tiles\{grid-template-columns:repeat\(5,/);
    expect(css).not.toMatch(/\.pet-tiles\{[^}]*auto-fill/);
    expect(css).toMatch(/\.pet-pick\{container-type:inline-size\}/);
  });

  it('lets the style gallery fit all seven cards on one row at the narrowest comfortable width', () => {
    const min = Number(css.match(/\.gallery\{[^}]*minmax\((\d+)px/)?.[1]);
    expect(7 * min + 6 * 8).toBeLessThanOrEqual(680);
    expect(css).toMatch(/\.look-card canvas\{[^}]*max-width:100%/);
  });
});
