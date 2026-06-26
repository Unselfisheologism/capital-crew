import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  outDir: 'dist',
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
