// Security B: engine calls that take safety go through apps/web/src/content/safety.ts, which always
// injects the campaign's current safety. Importing them directly anywhere else is an error.
const ENGINE_CALL_BAN = {
  name: '@prepdesk/engine',
  importNames: [
    'generate',
    'reroll',
    'applySafety',
    'batch',
    'rollTable',
    'askOracle',
    'drawMove',
    'cardFromShare',
    'generateName',
  ],
  message: "Call the wrappers in src/content/safety.ts: they pass the campaign's current safety.",
};

// D51: src/data is plain TypeScript (Dexie and the engine), never React, the router or a UI layer.
const DATA_LAYER_BAN = {
  group: ['react', 'react-dom', 'react-router', 'react-router/*', 'dexie-react-hooks'],
  message: 'src/data is plain TypeScript. Only data/hooks.ts may import React.',
};
const UI_LAYER_BAN = {
  group: ['**/kit', '**/kit/**', '**/features', '**/features/**', '**/app', '**/app/**'],
  message: 'src/data may not import the UI layers (kit, features, app).',
};

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, node: true },
  ignorePatterns: [
    'node_modules',
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    '.superpowers',
    '.claude',
  ],
  overrides: [
    {
      files: ['apps/web/src/**/*.{ts,tsx}'],
      excludedFiles: [
        'apps/web/src/content/**',
        'apps/web/src/dev/**',
        'apps/web/src/test/**',
        'apps/web/src/**/__tests__/**',
      ],
      rules: { 'no-restricted-imports': ['error', { paths: [ENGINE_CALL_BAN] }] },
    },
    {
      // Later override wins for the same rule, so this one carries both bans for data modules.
      files: ['apps/web/src/data/**/*.ts'],
      excludedFiles: ['apps/web/src/data/hooks.ts', 'apps/web/src/data/**/__tests__/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: [ENGINE_CALL_BAN], patterns: [DATA_LAYER_BAN, UI_LAYER_BAN] },
        ],
      },
    },
  ],
};
