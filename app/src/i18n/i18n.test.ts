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
  it('the document language follows the UI language', () => {
    const g = globalThis as unknown as { document?: { documentElement: { lang: string } } };
    g.document = { documentElement: { lang: 'pl' } };
    setLang('en');
    expect(g.document.documentElement.lang).toBe('en');
    delete g.document;
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
    const skip = /(\.test\.|testing\.ts|i18n[\\/]pl\.ts|renderer[\\/]scenes\.ts|renderer[\\/]dynamic[\\/]|looks-dev\.ts)/;
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
  it('the Polish installer file translates every Tauri NSIS message', () => {
    // klucze z wbudowanego English.nsh w @tauri-apps/cli 2.11.5
    const keys = ['addOrReinstall', 'alreadyInstalled', 'alreadyInstalledLong', 'appRunning', 'appRunningOkKill', 'chooseMaintenanceOption',
      'choowHowToInstall', 'createDesktop', 'dontUninstall', 'dontUninstallDowngrade', 'failedToKillApp', 'installingWebview2',
      'newerVersionInstalled', 'older', 'olderOrUnknownVersionInstalled', 'silentDowngrades', 'unableToUninstall', 'uninstallApp',
      'uninstallBeforeInstalling', 'unknown', 'webview2AbortError', 'webview2DownloadError', 'webview2DownloadSuccess',
      'webview2Downloading', 'webview2InstallError', 'webview2InstallSuccess', 'deleteAppData'];
    // bez BOM: Tauri kopiuje plik do build i sam dopisuje BOM; drugi psuje makensis („Invalid command”)
    const nsh = readFileSync(join(__dirname, '..', '..', 'src-tauri', 'nsis', 'Polish.nsh'), 'utf8');
    expect(nsh.charCodeAt(0)).not.toBe(0xfeff);
    const found = [...nsh.matchAll(/^LangString (\w+) \$\{LANG_POLISH\} "/gm)].map(m => m[1]);
    expect(found.sort()).toEqual([...keys].sort());
    const conf = JSON.parse(readFileSync(join(__dirname, '..', '..', 'src-tauri', 'tauri.conf.json'), 'utf8'));
    expect(conf.bundle.windows.nsis.customLanguageFiles).toEqual({ Polish: 'nsis/Polish.nsh' });
  });
});
