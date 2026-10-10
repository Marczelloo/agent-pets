import { onLinux } from '../platform';

/** What a key press means while a shortcut is being recorded. */
export type Recorded = { kind: 'set'; accelerator: string } | { kind: 'cancel' } | { kind: 'clear' } | { kind: 'ignore' };

/** The parts of a `KeyboardEvent` the recorder reads (so tests need no DOM). */
export interface KeyPress { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }

const MODIFIER_CODES = /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/;
const NAMED: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: 'Minus', Equal: 'Equal', BracketLeft: 'BracketLeft', BracketRight: 'BracketRight', Backslash: 'Backslash', Semicolon: 'Semicolon',
  Quote: 'Quote', Comma: 'Comma', Period: 'Period', Slash: 'Slash', Backquote: 'Backquote',
};

/** `KeyboardEvent.code` to the key name the core's shortcut parser accepts; physical key, so the keyboard layout does not matter. */
export function keyName(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code) ?? /^(F(?:[1-9]|1[0-9]|2[0-4]))$/.exec(code);
  if (m) return m[1];
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return `Numpad${m[1]}`;
  return NAMED[code] ?? null;
}

/**
 * A key press while recording. Escape cancels, a bare Backspace/Delete turns the shortcut off, a lone modifier waits for
 * the real key, and a key without any modifier is ignored (it would steal that key from every program).
 * Modifiers are written in a fixed order: `Ctrl+Alt+Shift+Super`.
 */
export function recordKey(e: KeyPress): Recorded {
  if (MODIFIER_CODES.test(e.code)) return { kind: 'ignore' };
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[];
  if (e.code === 'Escape' && mods.length === 0) return { kind: 'cancel' };
  if ((e.code === 'Backspace' || e.code === 'Delete') && mods.length === 0) return { kind: 'clear' };
  const key = keyName(e.code);
  if (!key || mods.length === 0) return { kind: 'ignore' };
  return { kind: 'set', accelerator: [...mods, key].join('+') };
}

const MOD_LABEL: Record<string, string> = { ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };
const WIN_KEYS = new Set(['super', 'cmd', 'command', 'win', 'meta']);

/** `Super+Shift+J` as shown to people: `Win + Shift + J` (`Super + Shift + J` on Linux). Spelling is forgiving because the file may be edited by hand. */
export function prettyAccelerator(acc: string): string {
  return acc.split('+').map(s => s.trim()).filter(Boolean).map(part => {
    const lower = part.toLowerCase();
    if (WIN_KEYS.has(lower)) return onLinux() ? 'Super' : 'Win';
    if (MOD_LABEL[lower]) return MOD_LABEL[lower];
    const m = /^(?:key|digit)(.)$/.exec(lower) ?? /^(?:arrow)(up|down|left|right)$/.exec(lower);
    const name = m ? m[1] : part;
    return name.length === 1 ? name.toUpperCase() : name[0].toUpperCase() + name.slice(1);
  }).join(' + ');
}
