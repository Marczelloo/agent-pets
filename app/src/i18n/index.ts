import { en } from './en';
import { pl } from './pl';
export type Dict = typeof pl;
export type Lang = 'pl' | 'en';
let cur: Lang = 'pl';
/** Windows language from Rust (`SettingsView.lang`); when known, resolves `auto`. */
let system: Lang | null = null;
export function setSystemLang(l: Lang | undefined): void { system = l ?? null; }
export const lang = (): Lang => cur;
export const t = (): Dict => (cur === 'en' ? en : pl);
export function setLang(l: Lang): void {
  cur = l;
  // screen reader selects a voice for the document language
  const doc = (globalThis as { document?: { documentElement?: { lang: string } } }).document;
  if (doc?.documentElement) doc.documentElement.lang = l;
}
/** `auto`: Polish only for a Polish browser language (WebView2 = Windows language). */
export function resolveLang(setting: 'auto' | 'pl' | 'en', languages: readonly string[] = globalThis.navigator?.languages ?? []): Lang {
  if (setting !== 'auto') return setting;
  if (system) return system;
  return languages[0]?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}
/** Browser preview (without Tauri): browser language or `?lang=pl|en`. */
export function setPreviewLang(): void {
  const q = new URLSearchParams(globalThis.location?.search ?? '').get('lang');
  setLang(resolveLang(q === 'pl' || q === 'en' ? q : 'auto'));
}
