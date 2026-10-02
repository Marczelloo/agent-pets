import type { KeyboardEvent } from 'react';

/** Target index for a radiogroup key (arrows wrap, Home/End jump); null for any other key. */
export function nextIndex(key: string, i: number, n: number): number | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': return (i + 1) % n;
    case 'ArrowLeft': case 'ArrowUp': return (i - 1 + n) % n;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return null;
  }
}

/** Roving-tabindex keyboard handling shared by Segmented and OptionCards: select and focus the neighbour. */
export function radioKeys<T extends string>(e: KeyboardEvent<HTMLElement>, values: T[], current: T, onChange: (v: T) => void) {
  const i = nextIndex(e.key, Math.max(0, values.indexOf(current)), values.length);
  if (i == null) return;
  e.preventDefault();
  onChange(values[i]);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[i]?.focus();
}
