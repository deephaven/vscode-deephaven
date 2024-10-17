/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    root: 'src',
    server: {
      deps: {
        // Imports of .js files without extensions fail without this
        inline: ['@deephaven-enterprise/query-utils'],
      },
    },
  },
});
