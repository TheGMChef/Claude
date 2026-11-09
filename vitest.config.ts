import { defineConfig } from 'vitest/config';

// Vitest 4 replaced the workspace file with `test.projects`. Each project keeps its own config
// (apps/web/vite.config.ts, packages/engine/vitest.config.ts) and its own globalSetup.
export default defineConfig({
  test: {
    projects: [
      'apps/*',
      'packages/*',
      'tools/*',
      // Repo scripts (scripts/licenses.mjs and friends): plain Node, no setup.
      { test: { name: 'scripts', include: ['scripts/**/*.test.mjs'], environment: 'node' } },
    ],
  },
});
