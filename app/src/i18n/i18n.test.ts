import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLang, setLang, t } from './index';
import { formatAgo, badgeTooltip } from '../tooltip/text';

afterEach(() => setLang('pl'));

describe('i18n', () => {
  it('auto picks Polish only for a Polish system', () => {
    expect(resolveLang('auto', ['pl-PL', 'en'])).toBe('pl');
    expect(resolveLang('auto', ['en-GB', 'pl'])).toBe('en');
    expect(resolveLang('auto', [])).toBe('en');
    expect(resolveLang('pl', ['en-US'])).toBe('pl');
  });
  it('switches texts at once', () => {
    setLang('en');
    expect(formatAgo(125_000)).toBe('2 min ago');
    expect(badgeTooltip([{ title: 'A' } as never, { title: 'B' } as never]).title).toBe('2 more sessions');
    expect(t().sessions(1)).toBe('1 session');
    setLang('pl');
    expect(t().sessions(5)).toBe('5 sesji');
  });
  it('no Polish literals left in the UI outside the Polish dictionary', () => {
    const root = join(__dirname, '..');
    const skip = /(\.test\.|testing\.ts|i18n[\\/]pl\.ts|renderer[\\/]scenes\.ts|looks-dev\.ts)/;
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(n => { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !skip.test(p) && files.push(p); });
    walk(root);
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const m of src.match(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1|>[^<>{}]+</g) ?? []) if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(m)) bad.push(`${f}: ${m.slice(0, 60)}`);
    }
    expect(bad).toEqual([]);
  });
  it('no untranslated Polish texts in the Tauri app (tr(lang, pl, en) and Lang::Pl arms are the Polish side)', () => {
    const files: string[] = [];
    const walk = (d: string) => readdirSync(d).forEach(n => { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : n.endsWith('.rs') && files.push(p); });
    walk(join(__dirname, '..', '..', 'src-tauri', 'src'));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8').split('#[cfg(test)]')[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const line of src.split('\n')) {
        if (/\btr\(|Lang::Pl|eprintln!|println!|\.expect\(|: \(&str, &str\) = \(/.test(line)) continue;
        for (const m of line.match(/"(?:[^"\\]|\\.)*"/g) ?? []) if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(m)) bad.push(`${f}: ${m.slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
