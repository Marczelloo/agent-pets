import { afterEach, describe, expect, it } from 'vitest';
import { setLinux } from '../platform';
import { merge } from './deep';
import { en } from './en';
import { enLinux } from './en.linux';
import { setLang, t } from './index';
import { pl } from './pl';
import { plLinux } from './pl.linux';

afterEach(() => { setLinux(false); setLang('pl'); });

describe('Linux texts', () => {
  it('Windows gets the base dictionaries untouched', () => {
    setLinux(false);
    setLang('en');
    expect(t()).toBe(en);
    setLang('pl');
    expect(t()).toBe(pl);
  });
  it('English on Linux: overridden keys say screen, system and Super; the rest is the base', () => {
    setLinux(true);
    setLang('en');
    const x = t();
    expect(x.settings.tabs.stage).toBe('Screen');
    expect(x.settings.tabs.look).toBe(en.settings.tabs.look);
    expect(x.settings.themeDesc).toBe('Light, dark or follow the system');
    expect(x.settings.maxVisible).toBe('Maximum pets on screen');
    expect(x.settings.hotkeys.note).toContain('Super');
    expect(x.settings.hotkeys.note).not.toContain('Win');
    expect(x.settings.hotkeys.press).toBe(en.settings.hotkeys.press);
    expect(x.settings.autostart).toBe('Start at login');
    expect(x.settings.langAuto).toBe('Automatic (like the system)');
    expect(x.stage.pos).toEqual({ right: 'Bottom right', left: 'Bottom left', custom: 'Bottom, custom', floating: 'Floating' });
    expect(x.stage.positionDesc).toContain('bottom edge of the screen');
    expect(x.stage.verticalBar).toBe(en.stage.verticalBar);
    expect(x.look.taskbar).toBe('At actual size');
    expect(x.panel.remove('Pet')).toBe('Remove pet: Pet');
    expect(x.panel.sessions).toBe(en.panel.sessions);
    expect(x.sessions(2)).toBe(en.sessions(2));
  });
  it('Polish on Linux: overridden keys drop the taskbar and Windows; the rest is the base', () => {
    setLinux(true);
    setLang('pl');
    const x = t();
    expect(x.settings.tabs.stage).toBe('Ekran');
    expect(x.settings.tabs.apps).toBe(pl.settings.tabs.apps);
    expect(x.settings.autostart).toBe('Uruchamiaj po zalogowaniu');
    expect(x.stage.pos.floating).toBe('Pływające');
    expect(x.stage.pos.right).toBe('Na dole po prawej');
    expect(x.panel.remove('Pies')).toBe('Usuń zwierzaka: Pies');
    expect(x.look.taskbar).toBe('Tak wygląda na ekranie');
    expect(x.stage.leftFallback).toBe(pl.stage.leftFallback);
  });
  it('the merge is memoized per language and follows language changes', () => {
    setLinux(true);
    setLang('en');
    const a = t();
    expect(t()).toBe(a);
    setLang('pl');
    expect(t()).not.toBe(a);
    expect(t().settings.tabs.stage).toBe('Ekran');
    setLang('en');
    expect(t()).toBe(a);
  });
  it('overlays only touch existing keys and no overridden text still talks about Windows or the taskbar', () => {
    const walk = (base: unknown, over: unknown, path: string, out: string[]) => {
      if (typeof over === 'function') { expect(typeof base, path).toBe('function'); return; }
      if (typeof over === 'object' && over) {
        for (const [k, v] of Object.entries(over)) { expect(base, `${path}.${k}`).toHaveProperty(k); walk((base as Record<string, unknown>)[k], v, `${path}.${k}`, out); }
        return;
      }
      expect(typeof base, path).toBe('string');
      if (/windows|taskbar|pasek|pasku|paska|zasobnik|tray/i.test(String(over))) out.push(`${path}: ${over}`);
    };
    const bad: string[] = [];
    walk(en, enLinux, 'en', bad);
    walk(pl, plLinux, 'pl', bad);
    expect(bad).toEqual([]);
  });
  it('merge keeps functions and arrays as leaves and does not mutate the base', () => {
    const base = { a: { b: 'x', c: [1, 2] }, f: () => 'base' };
    const out = merge(base, { a: { c: [3] }, f: () => 'over' });
    expect(out.a).toEqual({ b: 'x', c: [3] });
    expect(out.f()).toBe('over');
    expect(base.a.c).toEqual([1, 2]);
    expect(base.f()).toBe('base');
  });
});
