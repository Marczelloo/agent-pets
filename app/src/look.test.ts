import { describe, expect, it } from 'vitest';
import { appFor, defaultPets, lookFor, withOverride } from './look';

describe('look', () => {
  it('new settings: sticker, calm, no overrides', () => {
    expect(defaultPets()).toEqual({ style: 'sticker', motion: 'calm', overrides: {}, max_visible: 5, react_to_media: true });
  });
  it('maps a session to its app; router tasks win over the agent', () => {
    expect(appFor({ agent: 'claude', origin: 'cli' })).toBe('claude_code');
    expect(appFor({ agent: 'codex', origin: 'desktop' })).toBe('codex');
    expect(appFor({ agent: 'codex', origin: 'router' })).toBe('agent_router');
  });
  it('an override replaces only its own fields', () => {
    const p = { ...defaultPets(), overrides: { codex: { motion: 'dynamic' as const } } };
    expect(lookFor(p, 'codex')).toEqual({ style: 'sticker', motion: 'dynamic' });
    expect(lookFor(p, 'claude_code')).toEqual({ style: 'sticker', motion: 'calm' });
  });
  it('reads the old "dynamic" motion id as "dynamic"', () => {
    const p = { ...defaultPets(), motion: 'dynamic', overrides: { codex: { motion: 'dynamic' } } } as unknown as ReturnType<typeof defaultPets>;
    expect(lookFor(p, 'codex').motion).toBe('dynamic');
    expect(lookFor(p, 'claude_code').motion).toBe('dynamic');
  });
  it('survives settings without overrides (older app build)', () => {
    const p = { style: 'neon', motion: 'calm', max_visible: 5 } as unknown as ReturnType<typeof defaultPets>;
    expect(lookFor(p, 'codex')).toEqual({ style: 'neon', motion: 'calm' });
  });
  it('withOverride sets a field and "like default" removes it, dropping empty entries', () => {
    let p = withOverride(defaultPets(), 'codex', 'style', 'pixel');
    expect(p.overrides).toEqual({ codex: { style: 'pixel' } });
    p = withOverride(p, 'codex', 'motion', 'dynamic');
    expect(p.overrides).toEqual({ codex: { style: 'pixel', motion: 'dynamic' } });
    p = withOverride(withOverride(p, 'codex', 'style', null), 'codex', 'motion', null);
    expect(p.overrides).toEqual({});
  });
});
