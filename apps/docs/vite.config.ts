import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Standalone documentation / visualization portal.
 *
 * Runs separately from the app on http://localhost:5173 (Vite's default dev
 * port, pinned here with `strictPort` so the advertised URL is always right).
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
});
