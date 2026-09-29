import { t } from '../i18n';
import { LANGUAGE_LABEL } from '../i18n/pl';
import type { Language } from '../types';

/** Language choice: Automatic (like Windows), Polish, English. Language names always use their own language. */
export function LanguageSelect({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  return (
    <select aria-label={LANGUAGE_LABEL} value={value} onChange={e => onChange(e.target.value as Language)}>
      <option value="auto">{t().settings.langAuto}</option>
      <option value="pl">Polski</option>
      <option value="en">English</option>
    </select>
  );
}
