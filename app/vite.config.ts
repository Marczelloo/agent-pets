/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { rollupOptions: { input: { stage: page('index.html'), dev: page('dev.html'), tooltip: page('tooltip.html'), bubbles: page('bubbles.html'), panel: page('panel.html'), settings: page('settings.html'), stats: page('stats.html') } } },
  // the pixel-effect sweep renders every effect at three scales: slow on a busy CI runner
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], testTimeout: 30_000 },
});
