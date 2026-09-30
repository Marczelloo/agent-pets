import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// The promo video reuses the app's real renderer straight from app/src, so the pets in the video are the pets in the app.
export default defineConfig({
  clearScreen: false,
  resolve: { alias: { '@app': p('../../app/src') } },
  server: { port: 1421, strictPort: true, fs: { allow: [p('../..')] } },
});
