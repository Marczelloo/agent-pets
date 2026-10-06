import { describe, expect, it } from 'vitest';
import { applyTheme } from './theme';

const fakeRoot = () => {
  const attrs: Record<string, string> = {};
  const root = {
    setAttribute: (k: string, v: string) => { attrs[k] = v; },
    removeAttribute: (k: string) => { delete attrs[k]; },
  } as unknown as HTMLElement;
  return { root, attrs };
};

describe('applyTheme', () => {
  it('sets data-theme for light and dark', () => {
    const a = fakeRoot();
    applyTheme('dark', a.root);
    expect(a.attrs['data-theme']).toBe('dark');
    applyTheme('light', a.root);
    expect(a.attrs['data-theme']).toBe('light');
  });
  it('removes it for system, undefined and unknown values so the media query decides', () => {
    for (const v of ['system', undefined, 'weird'] as const) {
      const a = fakeRoot();
      applyTheme('dark', a.root);
      applyTheme(v as never, a.root);
      expect(a.attrs['data-theme']).toBeUndefined();
    }
  });
});
