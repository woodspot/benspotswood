import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, 'index.html'),
        skyarmada: resolve(import.meta.dirname, 'skyarmada/index.html'),
        keepfall: resolve(import.meta.dirname, 'keepfall/index.html'),
        balloons: resolve(import.meta.dirname, 'balloons/index.html'),
        match: resolve(import.meta.dirname, 'match/index.html'),
        phone: resolve(import.meta.dirname, 'phone/index.html'),
      },
    },
  },
});
