import { z } from 'zod';

// Zod 4 compiles fast parsers with `new Function`, probing for it first. Under the app's strict CSP
// (no 'unsafe-eval') that probe is reported as a securitypolicyviolation even though zod falls back.
// Interpreted parsing is plenty fast for content packs and card JSON, so never try eval.
z.config({ jitless: true });
