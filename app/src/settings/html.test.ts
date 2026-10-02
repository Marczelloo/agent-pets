import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../../settings.html', import.meta.url)), 'utf8').match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

describe('settings.html styles', () => {
  it('keeps no rules for the controls the shared kit replaced (old switch and segmented)', () => {
    expect(css).not.toMatch(/input\.switch/);
    expect(css).not.toMatch(/\.segmented/);
  });
});
