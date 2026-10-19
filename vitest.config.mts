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
        inline: [
          // Imports of .js files without extensions fail without this
          '@deephaven-enterprise/query-utils',
          // Imports `vscode`, which only resolves to the `__mocks__/vscode.ts`
          // mock when the module goes through Vite's transform
          '@vscode/python-environments',
        ],
      },
    },
  },
});
