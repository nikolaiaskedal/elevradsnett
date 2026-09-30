import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Statisk bygg av prototypen for GitHub Pages: `npm run build:pages` skriver til dist-pages/.
export default defineConfig({
  root: fileURLToPath(new URL('./github-pages', import.meta.url)),
  publicDir: fileURLToPath(new URL('./public', import.meta.url)),
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: { outDir: fileURLToPath(new URL('./dist-pages', import.meta.url)), emptyOutDir: true },
});
