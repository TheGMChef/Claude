// The one place the web app gets zod from. The engine's side-effect module calls
// `z.config({ jitless: true })`, and zod 4 reads `globalConfig.jitless` when a schema is built and
// first parsed. So the engine must load before any web schema is created, or zod would compile
// parsers with `new Function`, which the strict CSP forbids. Importing the engine first here, and
// ESLint plus boundary.test.ts banning bare `zod` imports elsewhere, keeps that order true.
import '@prepdesk/engine';
export { z } from 'zod';
