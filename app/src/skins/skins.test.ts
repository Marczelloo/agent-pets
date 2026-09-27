import { describe, expect, it } from 'vitest';
import { effectiveStyle } from '../renderer/effective';
import { drawPet, pen } from '../renderer';
import { recorder } from '../renderer/testing';
import { petFor, skinFor } from '../stage/sceneFor';
import type { Agent } from '../types';
import { blobPal, SKINS } from './index';

pen.font = 'x';

describe('skins for agents', () => {
  it('every agent has a pet', () => {
    const want: Record<Agent, string> = { claude: 'clawd', codex: 'kodek', opencode: 'opencode', antigravity: 'blob', copilot: 'blob',
      cursor: 'blob', grok: 'blob', other: 'blob' };
    for (const [a, s] of Object.entries(want)) expect(skinFor(a), a).toBe(s);
  });
  it('pixel and sticker draw new pets like clean; clawd and kodek keep their own art', () => {
    expect(effectiveStyle('pixel', 'opencode')).toBe('clean');
    expect(effectiveStyle('sticker', 'blob')).toBe('clean');
    expect(effectiveStyle('neon', 'opencode')).toBe('neon');
    expect(effectiveStyle('pixel', 'clawd')).toBe('pixel');
    expect(effectiveStyle('sticker', 'kodek')).toBe('sticker');
  });
  it('a blob colour comes from its name and stays the same', () => {
    expect(blobPal('Kilo CLI')).toEqual(blobPal('Kilo CLI'));
    expect(blobPal('Kilo CLI').m).not.toBe(blobPal('Goose').m);
    for (const v of Object.values(blobPal('Goose'))) expect(v).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('a door pet wears its colour and first letter; others do not', () => {
    const k = petFor({ agent: 'other', agent_name: 'kilo CLI' }, 'idle');
    expect([k.type, k.mark, k.pal?.m]).toEqual(['blob', 'K', blobPal('kilo CLI').m]);
    expect(petFor({ agent: 'other', agent_name: '  ' }, 'idle').mark).toBe('A');
    expect(petFor({ agent: 'other', agent_name: '<img>' }, 'idle').mark).toBe('I');
    const c = petFor({ agent: 'claude', agent_name: null }, 'idle');
    expect([c.type, c.mark, c.pal]).toEqual(['clawd', undefined, undefined]);
    expect(SKINS.opencode.legacy).toBeFalsy();
    expect(SKINS.clawd.legacy && SKINS.kodek.legacy).toBe(true);
  });
  it('the blob draws its letter and opencode its prompt eyes', () => {
    const rec = recorder();
    drawPet(rec.ctx, petFor({ agent: 'other', agent_name: 'Kilo' }, 'idle'), 60, 40, 1, 0);
    expect(rec.log.some(l => l.startsWith('fillText(K'))).toBe(true);
    const oc = recorder();
    drawPet(oc.ctx, petFor({ agent: 'opencode', agent_name: null }, 'idle'), 60, 40, 1, 0.5);
    expect(oc.log.some(l => l.includes('#F5F5F5') || l.includes('#f5f5f5'))).toBe(true);
  });
});
