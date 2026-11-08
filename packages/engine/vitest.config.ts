import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    // R25: compile the starter content packs before any test or bench reads their dist JSON.
    globalSetup: ['./vitest.global-setup.ts'],
  },
});
