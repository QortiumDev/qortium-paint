import { readFileSync } from 'node:fs';
// vitest/config, not vite: the `test` block below is a Vitest extension that
// plain vite's defineConfig rejects under excess-property checking.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
  },
  define: {
    __APP_VERSION__: JSON.stringify(`v${packageJson.version}`),
  },
  plugins: [
    react(),
    {
      // Emits the QAVS manifest (see qortium-home docs/APP_VERSIONING.md) at
      // the root of the published resource.
      name: 'qortium-app-manifest',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'qortium-app.json',
          source: `${JSON.stringify({ name: 'Paint', version: packageJson.version }, null, 2)}\n`,
        });
      },
    },
  ],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
