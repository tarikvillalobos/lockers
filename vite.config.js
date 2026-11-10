import { defineConfig } from 'vite';

// Três páginas: o armário 3D, as peças de chapa (CAD) e a fábrica
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      input: { index: 'index.html', pecas: 'pecas.html', fabrica: 'fabrica.html' },
    },
  },
});
