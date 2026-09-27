import { createRoot } from 'react-dom/client';
import Root from './App';
import { setPreviewLang } from '../i18n';

/** W zwykłej przeglądarce (`pnpm dev`, /stats.html) okno pokazuje dane pokazowe. */
const inTauri = '__TAURI_INTERNALS__' in window;
if (!inTauri) setPreviewLang();
createRoot(document.getElementById('root')!).render(<Root tauri={inTauri} />);
