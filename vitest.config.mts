/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    dir: 'src',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    },
    server: {
      deps: {
        // Imports of .js files without extensions fail without this
        inline: ['@deephaven-enterprise/query-utils'],
      },
    },
  },
});
