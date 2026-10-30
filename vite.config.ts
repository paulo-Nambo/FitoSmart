import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const raiz = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(raiz, 'client/src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        // LLaVA pode demorar 1–2 min; o default do proxy corta cedo demais.
        timeout: 180_000,
        proxyTimeout: 180_000,
      },
      // Biblioteca de referência: na BD (PostgreSQL) via API.
      '/referencias': {
        target: 'http://localhost:3001',
      },
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
});
