/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  build: { rollupOptions: { input: { stage: page('index.html'), dev: page('dev.html') } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
