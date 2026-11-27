import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  // When this copy was built, shown by the voice check (?voicecheck) to confirm a device has the latest.
  define: { __BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
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
        barnyard: resolve(import.meta.dirname, 'barnyard/index.html'),
        abc: resolve(import.meta.dirname, 'abc/index.html'),
        skyhold: resolve(import.meta.dirname, 'skyhold/index.html'),
        kids: resolve(import.meta.dirname, 'kids/index.html'),
      },
    },
  },
});
