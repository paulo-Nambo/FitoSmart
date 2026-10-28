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
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
  },
});
