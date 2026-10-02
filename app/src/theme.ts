import type { Theme } from './types';

/** `light` and `dark` force the theme through `data-theme`; anything else leaves the decision to the OS media query. */
export function applyTheme(theme: Theme | undefined, root: HTMLElement = document.documentElement): void {
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
}
