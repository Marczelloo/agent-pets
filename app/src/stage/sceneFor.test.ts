import { describe, expect, it } from 'vitest';
import { sceneFor, skinFor } from './sceneFor';

describe('sceneFor', () => {
  it('maps working tools to tool scenes, other to mcp', () => {
    expect(sceneFor({ state: 'working', tool: 'edit' })).toBe('edit');
    expect(sceneFor({ state: 'working', tool: 'web' })).toBe('web');
    expect(sceneFor({ state: 'working', tool: 'other' })).toBe('mcp');
    expect(sceneFor({ state: 'working', tool: null })).toBe('mcp');
  });
  it('maps states', () => {
    expect(sceneFor({ state: 'needs_you', tool: null })).toBe('needs');
    expect(sceneFor({ state: 'compacting', tool: null })).toBe('compact');
    expect(sceneFor({ state: 'ended', tool: null })).toBe('bye');
    expect(sceneFor({ state: 'sleep', tool: null })).toBe('sleep');
  });
  it('falls back on unknown values from a newer core', () => {
    expect(sceneFor({ state: 'paused' as never, tool: null })).toBe('thinking');
    expect(sceneFor({ state: 'working', tool: 'teleport' as never })).toBe('mcp');
  });
  it('picks the skin by agent', () => {
    expect(skinFor('claude')).toBe('clawd');
    expect(skinFor('codex')).toBe('kodek');
    expect(skinFor('gemini')).toBe('clawd');
  });
});
