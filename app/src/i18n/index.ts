import { en } from './en';
import { pl } from './pl';
export type Dict = typeof pl;
export type Lang = 'pl' | 'en';
let cur: Lang = 'pl';
export const lang = (): Lang => cur;
export const t = (): Dict => (cur === 'en' ? en : pl);
export function setLang(l: Lang): void { cur = l; }
/** `auto`: polski tylko dla polskiego języka przeglądarki (WebView2 = język Windows). */
export function resolveLang(setting: 'auto' | 'pl' | 'en', languages: readonly string[] = globalThis.navigator?.languages ?? []): Lang {
  if (setting !== 'auto') return setting;
  return languages[0]?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}
