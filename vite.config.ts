import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  // Local development: family sync talks to `php -S 127.0.0.1:8099 -t public` (the live site runs the PHP itself).
  server: { proxy: { '/api': 'http://127.0.0.1:8099' } },
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
