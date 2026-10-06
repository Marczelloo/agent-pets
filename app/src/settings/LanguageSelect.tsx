import { t } from '../i18n';
import { LANGUAGE_LABEL } from '../i18n/pl';
import type { Language } from '../types';
import { Select } from './ui';

/** Language choice: Automatic (like Windows), Polish, English. Language names always use their own language. */
export function LanguageSelect({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  return (
    <Select aria-label={LANGUAGE_LABEL} value={value} onChange={onChange} options={[
      { value: 'auto', label: t().settings.langAuto }, { value: 'pl', label: 'Polski' }, { value: 'en', label: 'English' },
    ]} />
  );
}
