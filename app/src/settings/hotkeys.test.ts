import { describe, expect, it } from 'vitest';
import { keyName, prettyAccelerator, recordKey, type KeyPress } from './hotkeys';

const press = (code: string, mods: Partial<KeyPress> = {}): KeyPress => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

describe('recordKey', () => {
  it('writes modifiers in a fixed order and the key by position', () => {
    expect(recordKey(press('KeyJ', { ctrlKey: true, shiftKey: true }))).toEqual({ kind: 'set', accelerator: 'Ctrl+Shift+J' });
    expect(recordKey(press('KeyJ', { shiftKey: true, ctrlKey: true, altKey: true, metaKey: true }))).toEqual({ kind: 'set', accelerator: 'Ctrl+Alt+Shift+Super+J' });
  });
  it('Meta is the Windows key, written Super', () => {
    expect(recordKey(press('KeyK', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'set', accelerator: 'Shift+Super+K' });
  });
  it('maps digits, function keys, arrows and the numpad without looking at the layout', () => {
    expect(recordKey(press('Digit1', { altKey: true }))).toEqual({ kind: 'set', accelerator: 'Alt+1' });
    expect(recordKey(press('F12', { ctrlKey: true }))).toEqual({ kind: 'set', accelerator: 'Ctrl+F12' });
    expect(recordKey(press('ArrowUp', { metaKey: true }))).toEqual({ kind: 'set', accelerator: 'Super+Up' });
    expect(recordKey(press('Numpad5', { ctrlKey: true }))).toEqual({ kind: 'set', accelerator: 'Ctrl+Numpad5' });
    expect(recordKey(press('Space', { shiftKey: true, altKey: true }))).toEqual({ kind: 'set', accelerator: 'Alt+Shift+Space' });
    expect(keyName('F24')).toBe('F24');
    expect(keyName('F25')).toBeNull();
    expect(keyName('IntlBackslash')).toBeNull();
  });
  it('a lone modifier keeps waiting', () => {
    for (const code of ['ControlLeft', 'ShiftRight', 'AltLeft', 'MetaLeft', 'MetaRight', 'OSLeft']) {
      expect(recordKey(press(code, { ctrlKey: true, shiftKey: true, altKey: true, metaKey: true }))).toEqual({ kind: 'ignore' });
    }
  });
  it('a key without a modifier is not accepted', () => {
    expect(recordKey(press('KeyJ'))).toEqual({ kind: 'ignore' });
    expect(recordKey(press('F5'))).toEqual({ kind: 'ignore' });
  });
  it('Escape cancels and a bare Backspace or Delete turns the shortcut off', () => {
    expect(recordKey(press('Escape'))).toEqual({ kind: 'cancel' });
    expect(recordKey(press('Backspace'))).toEqual({ kind: 'clear' });
    expect(recordKey(press('Delete'))).toEqual({ kind: 'clear' });
    // with a modifier they are ordinary keys
    expect(recordKey(press('Delete', { ctrlKey: true }))).toEqual({ kind: 'set', accelerator: 'Ctrl+Delete' });
  });
  it('a key the core parser has no name for is ignored', () => {
    expect(recordKey(press('IntlBackslash', { ctrlKey: true }))).toEqual({ kind: 'ignore' });
  });
});

describe('prettyAccelerator', () => {
  it('shows the Windows key as Win and spaces the parts', () => {
    expect(prettyAccelerator('Super+Shift+J')).toBe('Win + Shift + J');
    expect(prettyAccelerator('Ctrl+Alt+Shift+Super+F2')).toBe('Ctrl + Alt + Shift + Win + F2');
  });
  it('is forgiving about spelling in a hand-edited file', () => {
    expect(prettyAccelerator('cmd+shift+KeyK')).toBe('Win + Shift + K');
    expect(prettyAccelerator('control+digit1')).toBe('Ctrl + 1');
    expect(prettyAccelerator('Alt+ArrowLeft')).toBe('Alt + Left');
    expect(prettyAccelerator('Ctrl+Numpad5')).toBe('Ctrl + Numpad5');
  });
});
