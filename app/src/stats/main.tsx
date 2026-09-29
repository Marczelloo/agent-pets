import { createRoot } from 'react-dom/client';
import Root from './App';
import { setPreviewLang } from '../i18n';

/** In a regular browser (`pnpm dev`, /stats.html), the window shows demo data. */
const inTauri = '__TAURI_INTERNALS__' in window;
if (!inTauri) setPreviewLang();
createRoot(document.getElementById('root')!).render(<Root tauri={inTauri} />);
