import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const html = readFileSync(fileURLToPath(new URL('../../tooltip.html', import.meta.url)), 'utf8');

describe('tooltip.html', () => {
  it('measures the box at its natural width, not the width of the previous tooltip window', () => {
    // Okno tooltipa ma rozmiar poprzedniej treści. Bez max-content szerokość pudełka ograniczałaby
    // szerokość okna, więc każdy kolejny tooltip byłby najwyżej tak szeroki jak poprzedni.
    const rule = html.match(/#tip\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('width:max-content');
    expect(rule).toContain('max-width:264px');
  });
});
