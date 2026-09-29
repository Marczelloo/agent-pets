import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const html = readFileSync(fileURLToPath(new URL('../../tooltip.html', import.meta.url)), 'utf8');

describe('tooltip.html', () => {
  it('measures the box at its natural width, not the width of the previous tooltip window', () => {
    // Tooltip window has the previous content's size. Without max-content, the box width would be limited by
    // window width, so each new tooltip could be no wider than the previous one.
    const rule = html.match(/#tip\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('width:max-content');
    expect(rule).toContain('max-width:264px');
  });
});
