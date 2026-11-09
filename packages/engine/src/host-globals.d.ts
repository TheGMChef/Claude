// Globals every engine host provides (browsers, workers, Node 22), declared by hand so the engine
// compiles with neither the DOM nor the Node type libraries (CLAUDE.md engine boundary). Vitest 2
// used to leak @types/node into this project, which hid that `console` had no declaration.
// `var` (not `const`) so that `globalThis.console` / `globalThis.crypto` type-check as well.
/* eslint-disable no-var */
declare var console: { warn(...data: unknown[]): void };
declare var crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T };
