import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    // R25: compile the starter content packs before any test or bench reads their dist JSON.
    globalSetup: ['./vitest.global-setup.ts'],
    // The exhaustive share-code property tests take ~3s alone and ~7s under Vitest 4's v8
    // coverage on a busy 4-core runner; the 5s default made them time out, not fail.
    testTimeout: 20_000,
  },
});
