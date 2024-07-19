/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './test-reports/vitest.junit.xml',
    },
  },
});
