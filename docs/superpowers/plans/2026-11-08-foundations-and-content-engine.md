# Foundations + Content Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an installable, offline-capable Prep Desk web shell with the Ink & Index component kit, plus a DOM-free content engine that turns YAML content packs into reproducible, lockable, safety-filtered cards, names, oracle answers and GM moves.

**Architecture:** A pnpm monorepo. `packages/engine` is pure TypeScript with no DOM, storage or network; it owns compiling and linting content so user packs get the same checks at runtime. `packages/content-fantasy` and `packages/content-core` hold YAML sources that `tools/content-cli` (a thin file reader over the engine) compiles to JSON. `apps/web` is a React + Vite PWA that imports compiled packs and the engine, and exposes dev-only `/kit` and `/forge-preview` pages.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vite, React 18, React Router 6, vite-plugin-pwa, Vitest + Testing Library, Playwright + @axe-core/playwright, zod, yaml, @fontsource-variable/*, ESLint + Prettier, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-08-foundations-and-content-engine-design.md`

## Global Constraints

- TypeScript `strict: true` everywhere; `noUncheckedIndexedAccess: true`.
- `packages/engine` imports nothing from the repo and no DOM types (its tsconfig `lib` is `["ES2022"]`, no `"DOM"`). Its only runtime dependencies are `zod` and `yaml` (`yaml` is needed so `validateUserPack` can parse user YAML).
- The web app imports **compiled JSON packs only**. YAML is parsed at runtime only by `validateUserPack`.
- Tablet landscape **1194×834** is the primary viewport; also 834×1194, 1440×900, 390×844. No horizontal page scroll at any of them.
- Interactive elements are ≥ 44×44 px, keyboard reachable, with a 2px `--pencil` focus ring; text contrast ≥ 4.5:1 in both themes; `prefers-reduced-motion` respected.
- Fonts are self-hosted (no Google Fonts requests): Bricolage Grotesque, Instrument Sans, Shantell Sans (variable), JetBrains Mono 500/600.
- Palette (day / night): paper `#F3EDE1`/`#191714` · card `#FFFDF8`/`#24201B` · ink `#1F1B16`/`#EFE8DB` · pencil `#2F4BA0`/`#93A9F2` · highlight `#F6D55C`/`#E8C25A` · stamp `#B23A26`/`#F08C78`. Muted ink: `#5E554A`/`#A89E8E`.
- Content is original writing, licensed CC-BY-4.0 (`LICENSE-CONTENT` in each content package). No third-party table text.
- Ids are namespaced `<pack>.<area>.<name>`. User packs must use the `user.` namespace.
- Seed codes are 8 Crockford base32 characters shown as `XXXX-XXXX`.
- Safety vocabulary v1 (exact list): `violence, gore, death, torture, sexual-content, abuse, child-harm, self-harm, suicide, addiction, slavery, body-horror, insects, spiders, rats, drowning, fire, claustrophobia, religion, hate-bigotry, animal-harm, pregnancy, mental-illness, police, war`. Default campaign lines: `["child-harm"]`.
- Commit after every task; never commit failing tests. Commit messages end with the session's attribution lines.

## Review Focus

1. **A pasted share code is garbled, truncated, lowercase or has stray spaces.** A person expects lowercase and spacing to be forgiven, and a clear "That code doesn't look right" message for real garbage, not a crash or a silently different NPC. → tests in Task 2 and Task 16.
2. **Safety lines empty a table entirely** (e.g. every `secret` entry is tagged `violence` and the DM lines out violence). Safety must never be relaxed to fill a field; a person expects a visible "nothing fits your safety settings" placeholder. → test in Task 6.
3. **Names in `avoidNames` differ only by case or accents** ("odrin", "Ödrin"). A person expects the distinctiveness guard to treat them as the same name. → test in Task 8.
4. **A user pack reuses a built-in id** (e.g. defines `fantasy.npc.want`). A person expects a readable validation error, not a silent override of core content or a crash. → test in Task 9.
5. **Storage is blocked** (private mode, Safari ITP). A person expects the theme toggle to still work for the session and the app to load normally. → test in Task 12.

---

## File Structure

```
package.json · pnpm-workspace.yaml · tsconfig.base.json · .eslintrc.cjs · .prettierrc · vitest.workspace.ts
.github/workflows/ci.yml

packages/engine/
  package.json · tsconfig.json
  src/index.ts            public exports only
  src/rng.ts              cyrb128, sfc32, Rng type, newSeed, seed-code helpers
  src/share.ts            encodeShare / decodeShare
  src/safety.ts           SAFETY_VOCABULARY, SafetySettings, DEFAULT_LINES
  src/schema.ts           zod schemas for YAML source + compiled pack types
  src/template.ts         slot parser → AST, cycle detection helpers
  src/library.ts          loadPacks, Library index, lookups
  src/select.ts           tag/safety filtering, prefer weighting, relaxation, weighted pick
  src/render.ts           template rendering against Library + Context
  src/names.ts            culture name generation + distinctiveness guard
  src/generate.ts         generate, reroll, batch, Card types
  src/oracle.ts           askOracle, drawMove
  src/compile.ts          compileDocs: parsed YAML docs → CompiledPack
  src/lint.ts             lintPack: all lint rules
  src/userPack.ts         validateUserPack
  src/errors.ts           ContentError
  test/*.test.ts · test/fixtures/** · bench/generate.bench.ts

tools/content-cli/
  package.json · src/cli.ts · src/readPack.ts · test/*.test.ts · test/fixtures/**

packages/content-core/     src/moves.yaml · LICENSE-CONTENT · package.json (exports dist/core.json)
packages/content-fantasy/  src/cultures/*.yaml · src/tables/npc/*.yaml · src/generators/npc.yaml
                           src/oracle/*.yaml · src/vocabulary.yaml · CONTRIBUTING.md · LICENSE-CONTENT · package.json

apps/web/
  index.html · vite.config.ts · package.json · tsconfig.json · playwright.config.ts
  src/main.tsx · src/app/{App.tsx,routes.tsx,TopBar.tsx,ModeShell.tsx,theme.ts,ThemeProvider.tsx,UpdateChip.tsx}
  src/styles/{tokens.css,base.css,fonts.css}
  src/kit/{InkFilter,InkOutline,Card,Button,IconButton,Chip,Tabs,Stamp,Highlight,MarginNote,Clock,Field,SectionLabel,DockButton,Icon}.tsx + kit.css + index.ts
  src/kit/__tests__/*.test.tsx
  src/dev/{KitPage.tsx,ForgePreview.tsx,engine.ts}
  e2e/{routes,kit,forge,offline}.spec.ts
```

---

### Task 1: Workspace scaffold and CI

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.eslintrc.cjs`, `.prettierrc`, `vitest.workspace.ts`, `.gitignore`, `.github/workflows/ci.yml`
- Create: `packages/engine/{package.json,tsconfig.json,src/index.ts}`, `packages/engine/test/smoke.test.ts`

**Interfaces:**
- Produces: root scripts `lint`, `typecheck`, `test`, `content:build`, `content:lint`, `build`, `e2e`; package name `@prepdesk/engine`.

- [ ] **Step 1: Write the smoke test** `packages/engine/test/smoke.test.ts`: `import * as engine from '../src'` and `expect(engine.VERSION).toBe('0.1.0')`.
- [ ] **Step 2: Run** `pnpm -r test` → FAIL (no workspace yet / `VERSION` missing).
- [ ] **Step 3: Create the workspace.** Workspaces: `apps/*`, `packages/*`, `tools/*`. `tsconfig.base.json` per Global Constraints. `export const VERSION = '0.1.0'` in `src/index.ts`. The engine tsconfig uses `lib: ["ES2022"]`. CI job on Node 20 runs `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `content:lint`, `build` (the e2e job is added in Task 17).
- [ ] **Step 4: Run** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` → all PASS.
- [ ] **Step 5: Commit** `chore: scaffold pnpm workspace, engine package and CI`.

---

### Task 2: Seeded RNG, seed codes and share codes

**Files:**
- Create: `packages/engine/src/rng.ts`, `packages/engine/src/share.ts`
- Test: `packages/engine/test/rng.test.ts`, `packages/engine/test/share.test.ts`

**Interfaces:**
- Produces:
  - `type Rng = { next(): number /* [0,1) */; int(maxExclusive: number): number }`
  - `hashSeed(...parts: (string|number)[]): [number, number, number, number]` (cyrb128)
  - `createRng(...parts: (string|number)[]): Rng` (sfc32 seeded by `hashSeed`)
  - `newSeed(): string` → `"XXXX-XXXX"` from `crypto.getRandomValues` (globalThis.crypto; Node 20 has it)
  - `normalizeSeed(input: string): string | null` → uppercases, strips spaces, maps `O→0, I/L→1`, inserts the dash; `null` if not 8 valid Crockford chars
  - `type ShareState = { seed: string; nonces: number[]; locks: boolean[] }` (arrays in generator field order)
  - `encodeShare(state: ShareState): string` → `SEED` alone when all nonces are 0 and nothing is locked; otherwise `SEED.L<locks bitmask base32>.N<nonces base32 joined by "_">`, e.g. `K7Q2-M9XD.L3.N0_2_2_0_1_0_0`
  - `decodeShare(code: string, fieldCount: number): { ok: true; state: ShareState } | { ok: false; error: 'malformed' | 'field-count' }`

- [ ] **Step 1: Write failing tests**
  - `createRng('a')` and `createRng('a')` produce identical first 100 values; `createRng('a')` vs `createRng('b')` differ.
  - `createRng('x').int(10)` is always an integer in `[0,10)` across 10,000 calls.
  - `newSeed()` matches `/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/`.
  - `normalizeSeed(' k7q2m9xd ')` → `'K7Q2-M9XD'`; `normalizeSeed('k7q2-m9xo')` → `'K7Q2-M9X0'`; `normalizeSeed('hello')` → `null`.
  - Round trip: `decodeShare(encodeShare(s), 7)` deep-equals `s` for `{seed:'K7Q2-M9XD', nonces:[0,2,2,0,1,0,0], locks:[true,true,false,false,false,false,false]}`; and for an all-zero, unlocked state, the encoding equals `'K7Q2-M9XD'`.
  - Review Focus 1: `decodeShare('k7q2-m9xd . l3 . n0_2_2_0_1_0_0', 7)` decodes the same as the canonical code; `decodeShare('K7Q2-M9', 7)` → `{ok:false, error:'malformed'}`; `decodeShare('K7Q2-M9XD.L3.N0_1', 7)` → `{ok:false, error:'field-count'}`.
- [ ] **Step 2: Run** `pnpm --filter @prepdesk/engine test rng share` → FAIL.
- [ ] **Step 3: Implement** `rng.ts` and `share.ts` per the Interfaces above. `share.ts` uses `normalizeSeed` for the seed part and is forgiving of case and whitespace around separators.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(engine): seeded RNG, seed codes and share codes`.

---

### Task 3: Content schema, safety vocabulary and errors

**Files:**
- Create: `packages/engine/src/schema.ts`, `packages/engine/src/safety.ts`, `packages/engine/src/errors.ts`
- Test: `packages/engine/test/schema.test.ts`

**Interfaces:**
- Produces:
  - `SAFETY_VOCABULARY: readonly string[]` (exact list in Global Constraints); `type SafetySettings = { lines: string[]; veils: string[] }`; `DEFAULT_LINES = ['child-harm']`
  - `class ContentError extends Error { code: ContentErrorCode; path: string; packId: string }`, where `ContentErrorCode = 'duplicate-id' | 'unresolved-ref' | 'cycle' | 'empty-table' | 'bad-weight' | 'unknown-safety-tag' | 'unknown-tag' | 'weak-culture' | 'missing-source' | 'schema' | 'namespace'`
  - Source zod schemas (one per YAML `kind`): `TableSrc`, `CultureSrc`, `GeneratorSrc`, `OracleSrc`, `DeckSrc`, `VocabularySrc` (`{kind:'vocabulary', tags: string[]}`), plus `PackManifestSrc` (`{id, version, genre?, title}` from `package.json` → `prepdesk` key). Field shapes exactly as spec §4.2. `weight` defaults to 1 and must be > 0. Generator field sources are a discriminated union over `table | template | name ('full'|'given'|'family') | culture (path) | gen (generator id) | pick ({table, count})`.
  - Compiled types: `CompiledPack = { id; version; genre?; tables: Record<id, CompiledTable>; cultures; generators; oracles; decks; vocabulary: string[] }`. In `CompiledTable.entries[]`, `text` is replaced by `ast: TemplateAst` (from Task 4) and each entry gets a stable `id = "<tableId>#<index>"`.

- [ ] **Step 1: Write failing tests:** a valid table source parses with weight defaulted to 1; `weight: 0` fails; an unknown `kind` fails; the generator field `{ pick: { table: 'x', count: 3 } }` parses; `SAFETY_VOCABULARY.length === 25` and includes `'child-harm'` and `'claustrophobia'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the schemas, vocabulary and error class.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): content schemas, safety vocabulary, ContentError`.

---

### Task 4: Template parser

**Files:**
- Create: `packages/engine/src/template.ts`
- Test: `packages/engine/test/template.test.ts`

**Interfaces:**
- Produces:
  - `type Modifier = { kind: 'cap' } | { kind: 'a' } | { kind: 'or'; fallback: string }`
  - `type Slot = { kind: 'table'; ref: string } | { kind: 'ctx'; path: string } | { kind: 'gen'; generator: string; field: string } | { kind: 'name'; part: 'full'|'given'|'family' }`
  - `type TemplateAst = Array<string | { slot: Slot; mods: Modifier[] }>`
  - `parseTemplate(text: string): TemplateAst` (throws `ContentError('schema')` on an unclosed `{`)
  - `templateRefs(ast: TemplateAst): { tables: string[]; generators: string[] }`
  - `findCycle(graph: Map<string, string[]>): string[] | null` (returns the cycle path)
- Slot grammar: `{ctx.a.b}` → ctx; `{gen:x.y.field}` → gen (last dot segment is the field); `{name}` / `{name:given}` / `{name:family}` → name; anything else → table ref. Modifiers follow `|`; `or:` takes the rest of the segment as its fallback. `\{` is a literal brace.

- [ ] **Step 1: Write failing tests**
  - `parseTemplate('to pay {fantasy.time.deadline|cap}')` → `['to pay ', {slot:{kind:'table',ref:'fantasy.time.deadline'}, mods:[{kind:'cap'}]}]`.
  - `parseTemplate('{ctx.settlement.name|or:town}')` → ctx slot with `or` fallback `'town'`.
  - `parseTemplate('{gen:fantasy.npc.name}')` → `{kind:'gen', generator:'fantasy.npc', field:'name'}`.
  - `parseTemplate('{name:given} \\{x\\}')` → name slot, then literal `' {x}'`.
  - `parseTemplate('oops {unclosed')` throws a `ContentError` with code `'schema'`.
  - `findCycle(new Map([['a',['b']],['b',['a']]]))` → `['a','b','a']`; an acyclic graph → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): template slot parser and cycle detection`.

---

### Task 5: Compile and lint (engine) + content CLI

**Files:**
- Create: `packages/engine/src/compile.ts`, `packages/engine/src/lint.ts`
- Create: `tools/content-cli/{package.json,src/cli.ts,src/readPack.ts}`
- Test: `packages/engine/test/compile.test.ts`, `packages/engine/test/lint.test.ts`, `tools/content-cli/test/cli.test.ts`; fixture packs under `tools/content-cli/test/fixtures/{good,dup-id,unresolved,cycle,empty,bad-safety,unknown-tag,weak-culture,missing-source}/`

**Interfaces:**
- Consumes: Task 3 schemas, Task 4 `parseTemplate`, `templateRefs`, `findCycle`.
- Produces:
  - Engine: `compileDocs(manifest: PackManifest, docs: unknown[]): { pack: CompiledPack; errors: ContentError[] }`
  - Engine: `lintPack(pack: CompiledPack, deps?: CompiledPack[]): ContentError[]` (`deps` lets `fantasy` reference `core`)
  - CLI: `readPackDir(dir: string): { manifest: PackManifest; docs: unknown[] }` (reads `package.json#prepdesk` + every `src/**/*.yaml`; multi-document YAML allowed), then calls the engine
  - Bin `prepdesk-content build <dir> [--out dist]` writes `dist/<id>.json`, exiting 1 on errors; `prepdesk-content lint <dir>` prints `code path message` per error, exiting 1 if any.
  - Root scripts: `content:build` and `content:lint` iterate `packages/content-*`.
- Lint rules (one fixture each): duplicate ids; unresolved slot refs (short refs resolve within the same pack namespace first, then absolute); reference cycles across tables/generators; empty tables; unknown safety tags; entry tags not in the pack vocabulary; a culture that can't produce 20 distinct valid names in 500 tries (calls `generateName` from Task 8; until Task 8 lands, this rule is wired but its test is `it.todo`, and Task 8 turns it on); generator fields pointing at missing sources.

- [ ] **Step 1: Write failing tests:** compiling `fixtures/good` (via `readPackDir` + `compileDocs`) returns zero errors and a table entry with an `id` ending `#0` and a parsed `ast`; each failing fixture yields exactly its expected error code (table-driven test over the fixture dirs).
- [ ] **Step 2: Run** `pnpm --filter @prepdesk/engine test compile lint && pnpm --filter content-cli test` → FAIL.
- [ ] **Step 3: Implement** `compileDocs` and `lintPack` in the engine, and the thin CLI wrapper.
- [ ] **Step 4: Run** → PASS (`weak-culture` test pending as `todo`).
- [ ] **Step 5: Commit** `feat(content-cli): compile and lint content packs`.

---

### Task 6: Library and table selection (tags, safety, relaxation)

**Files:**
- Create: `packages/engine/src/library.ts`, `packages/engine/src/select.ts`
- Test: `packages/engine/test/select.test.ts`, fixture `packages/engine/test/fixtures/select-pack.json`

**Interfaces:**
- Consumes: `CompiledPack`, `SafetySettings`, `Rng`.
- Produces:
  - `type Library = { packs: CompiledPack[]; table(id: string, fromPack?: string): CompiledTable | undefined; culture(id): CompiledCulture | undefined; generator(id): CompiledGenerator | undefined; oracle(id); deck(id) }`
  - `loadPacks(packs: CompiledPack[]): Library` (later packs layer over earlier ones only for `user.*` ids; other duplicates throw `ContentError('duplicate-id')`)
  - `type TagFilter = { require?: string[]; prefer?: string[]; exclude?: string[] }`
  - `selectEntry(table: CompiledTable, rng: Rng, opts: { genre?: string; tags?: TagFilter; safety?: SafetySettings }): { entry: CompiledEntry | null; relaxed: boolean; blocked: boolean; veiled: string[] }`
- Order: genre → require → exclude → **safety lines (never relaxed)** → prefer ×3 weight → weighted pick. If the pool is empty after tag filters, drop `prefer`, then `require`, then `exclude`, setting `relaxed: true`. If it's empty only because of safety lines, return `{entry:null, blocked:true}`.

- [ ] **Step 1: Write failing tests**
  - Weights: 10,000 picks from a table weighted 1/2/7 land at 10%/20%/70% ± 2%.
  - `require:['urban']` returns only urban-tagged entries; `exclude:['debt']` never returns debt entries; `prefer:['family']` raises the family entry's share by roughly 3×.
  - Relaxation: `require:['nonexistent']` returns an entry with `relaxed: true`.
  - Safety: with `lines:['violence']`, a violence-tagged entry never appears in 10,000 picks; with `veils:['fire']`, picking a fire entry returns `veiled:['fire']`.
  - Review Focus 2: a table whose every entry is tagged `violence`, with `lines:['violence']` → `{entry:null, blocked:true, relaxed:false}`.
  - `loadPacks` throws `duplicate-id` when two non-user packs define the same table id.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): library index and tag/safety-aware selection`.

---

### Task 7: Template rendering

**Files:**
- Create: `packages/engine/src/render.ts`
- Test: `packages/engine/test/render.test.ts`

**Interfaces:**
- Consumes: `Library`, `selectEntry`, `TemplateAst`, `Rng`, and (by injection, to avoid circular imports) a name resolver and a generator-field resolver.
- Produces:
  - `type Context = { genre?: string; cultureId?: string; tags?: TagFilter; safety?: SafetySettings; avoidNames?: string[]; campaign?: { get(path: string): string | undefined }; [key: string]: unknown }`
  - `type RenderEnv = { lib: Library; ctx: Context; rng: Rng; packId: string; resolveName(part): string; resolveGen(generatorId, field, ctx): string; mode: 'dev' | 'prod' }`
  - `renderTemplate(ast: TemplateAst, env: RenderEnv, depth?: number): { text: string; sources: string[]; veiled: string[]; blocked: boolean }`
- Rules:
  - `ctx.campaign.*` paths go through `campaign.get`; other `ctx.*` paths read the context object.
  - A missing value uses the `or:` fallback; with no fallback it renders `[missing: ctx.x]` in dev and `''` in prod, with one `console.warn` per path.
  - `cap` uppercases the first letter. `a` prefixes `a ` or `an ` (vowel-sound check on the first letter).
  - Depth over 8 stops expansion and renders `''`.
  - A blocked nested table makes the whole result `blocked: true`.

- [ ] **Step 1: Write failing tests:** nested table slots expand; `{x|cap}` capitalises; `{role|a}` yields `"an innkeeper"` / `"a ferryman"`; `{ctx.settlement.name|or:town}` uses `'Saltmere'` when present and `'town'` when absent; `{ctx.campaign.activeFront.name}` calls `campaign.get('activeFront.name')`; a missing ctx with no fallback → `'[missing: ctx.x]'` in dev, `''` in prod; a self-recursive table (built in the test, bypassing lint) stops at depth 8 without throwing; `sources` lists every entry id used.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): template rendering with context, modifiers and depth cap`.

---

### Task 8: Name generation and the distinctiveness guard

**Files:**
- Create: `packages/engine/src/names.ts`
- Modify: `packages/engine/src/lint.ts` (enable the `weak-culture` rule), `packages/engine/test/lint.test.ts` (un-`todo` it)
- Test: `packages/engine/test/names.test.ts`, fixture culture `packages/engine/test/fixtures/marsh.culture.json`

**Interfaces:**
- Consumes: `CompiledCulture`, `Rng`.
- Produces:
  - `type NameOptions = { seed?: string; avoidNames?: string[]; exclude?: Set<string> }`
  - `type NameResult = { name: string; given: string; family?: string; cultureId: string; voice: { summary: string; tips: string[] }; fromExamples: boolean; relaxed: boolean }`
  - `generateName(lib: Library, cultureId: string, opts?: NameOptions): NameResult`
  - `nameWithRng(culture: CompiledCulture, rng: Rng, opts: Omit<NameOptions,'seed'>): NameResult` (used by render, generate and batch)
  - `normalizeName(s: string): string` (NFD, strip diacritics, lowercase, trim)
- Algorithm:
  1. With probability `exampleChance`, pick an unused example. Otherwise build each part from `pattern` (`x?` = 50%, `x?:0.3` = 30%) and capitalise.
  2. Reject a candidate matching any `banned` regex, or present in `exclude`, and retry (max 20).
  3. Guard against `avoidNames`, comparing given names via `normalizeName`: reject on (a) the same first letter as any of the **last 8**, (b) edit distance ≤ 2 to any, (c) the same first three letters as any.
  4. After 20 failures, drop (a), then (c), then (b), and set `relaxed: true`.

- [ ] **Step 1: Write failing tests**
  - Determinism: same seed → same name.
  - `banned` patterns never appear in 2,000 names.
  - Example mix rate within `exampleChance ± 0.04` over 2,000 names (`fromExamples`).
  - Guard: with `avoidNames:['Odrin Vey']`, no result's given name starts with `O` or is within edit distance 2 of `odrin` (2,000 trials).
  - Review Focus 3: `avoidNames:['ÖDRIN vey']` blocks `Odrin`, `Odran` and `Odrinn` the same way.
  - Relaxation: a culture that can only make `O…` names, with `avoidNames:['Oswin']`, still returns a name with `relaxed: true`.
  - `exclude` prevents exact repeats.
  - The voice summary and tips come from the culture.
  - The `weak-culture` fixture now fails lint.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** engine + content-cli tests → PASS.
- [ ] **Step 5: Commit** `feat(engine): culture name generation with distinctiveness guard`.

---

### Task 9: Generators, cards, reroll, batch and user packs

**Files:**
- Create: `packages/engine/src/generate.ts`, `packages/engine/src/userPack.ts`
- Modify: `packages/engine/src/index.ts` (export the public API from spec §4.5)
- Test: `packages/engine/test/generate.test.ts`, `packages/engine/test/userPack.test.ts`, fixtures `test/fixtures/npc-pack/` (YAML parsed with `yaml` and compiled with `compileDocs` in test setup) and `test/fixtures/__snapshots__`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces:
  - `type CardField = { value: string; locked: boolean; nonce: number; sources: string[]; blocked?: boolean }`
  - `type Card = { id: string; generatorId: string; packVersion: string; seed: string; fields: Record<string, CardField>; display: string; context: Record<string, unknown>; flags: { veiled: string[]; relaxed: boolean } }`
  - `generate(lib, generatorId, opts?: { seed?: string; context?: Context }): Card`
  - `reroll(lib, card, opts?: { locks?: string[]; context?: Context }): Card` (`locks` replaces the card's lock set when given)
  - `cardToShare(lib, card): string` / `cardFromShare(lib, generatorId, code, context?): { ok: true; card: Card } | { ok: false; error: 'malformed' | 'field-count' }` (wrap Task 2 using generator field order)
  - `type RollResult = { text: string; sources: string[]; relaxed: boolean; blocked: boolean; veiled: string[] }`; `rollTable(lib, tableId, opts?): RollResult`
  - `batch(lib, requests: Array<{ generatorId: string; count: number } | { tableId: string; count: number } | { cultureId: string; count: number }>, opts?): Array<Card | RollResult | NameResult>` (one shared `exclude` set so names never repeat within a batch; `avoidNames` grows as names are produced)
  - `validateUserPack(src: string | object, deps?: CompiledPack[]): { ok: true; pack: CompiledPack } | { ok: false; errors: ContentError[] }` (parses YAML if given a string, then `compileDocs` + `lintPack` + the `user.` namespace check)
- Rules:
  - Each field's rng is `createRng(card.seed, fieldName, nonce)`.
  - `pick` joins N distinct entries with `"; "`.
  - `gen` fields run a sub-generator with the context merged as `{ ...parentCtx, ...parentExplicit }`; parent values win.
  - `display` renders the generator's `display` template against the field values.
  - A blocked field gets `value: '—'`, `blocked: true`, and display text `nothing fits your safety settings`.
  - Card `id` uses `crypto.randomUUID()`.

- [ ] **Step 1: Write failing tests**
  - Snapshot: `generate(lib,'test.npc',{seed:'TEST-0001', context:{cultureId:'test.culture.marsh'}}).fields` matches the stored snapshot.
  - Locks: lock `name` and `want`, then reroll 1,000 times. Those two values are byte-identical every time; each unlocked field changes in ≥ 95% of rerolls; unlocked nonces increment by 1 per reroll.
  - Share: `cardFromShare(lib,'test.npc', cardToShare(lib, rerolledCard), ctx)` reproduces every field value.
  - Inheritance: a `tavern` generator with `keeper: { gen: test.npc }` passes `cultureId`, and the keeper's name comes from that culture; a parent explicit `settlement` is not overwritten.
  - Batch: 60 names from one culture have no duplicates.
  - Safety: with `lines:['violence']` and an all-violence `secret` table, the card's `secret` field is `{value:'—', blocked:true}`.
  - User packs: a YAML string with id prefix `user.` validates; Review Focus 4: a user pack defining `fantasy.npc.want` returns `{ok:false}` with one `namespace` error whose message names the id; malformed YAML returns `{ok:false}` with a `schema` error, never a throw.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): generators, cards, lock/reroll, batch and user packs`.

---

### Task 10: Oracle and GM moves deck

**Files:**
- Create: `packages/engine/src/oracle.ts`
- Test: `packages/engine/test/oracle.test.ts`

**Interfaces:**
- Produces:
  - `type Likelihood = 'certain' | 'likely' | 'even' | 'unlikely' | 'remote'`
  - `type OracleResult = { roll: number; likelihood: Likelihood; answer: 'yes'|'no'; modifier?: 'and'|'but'; meaning: [string, string] }`
  - `askOracle(lib, oracleId, likelihood, opts?: { seed?: string }): OracleResult`
  - `oracleOutcome(roll: number, yes: number, extreme: number): Pick<OracleResult,'answer'|'modifier'>` (pure, exported for tests)
  - `type MoveCard = { id: string; text: string; prompt: string }`
  - `drawMove(lib, deckId, opts?: { seed?: string; exclude?: string[] }): MoveCard`
- Rule (spec §4.5): roll is 1–100. `yes` if `roll ≤ yes`. `and` if `roll ≤ extreme` or `roll > 100 − extreme`. `but` if `|roll − yes| ≤ 5`. `and` wins over `but`.

- [ ] **Step 1: Write failing tests** for `oracleOutcome` with `yes=50, extreme=8`:

  | roll | answer | modifier |
  |---|---|---|
  | 1 | yes | and |
  | 8 | yes | and |
  | 9 | yes | — |
  | 45 | yes | but |
  | 50 | yes | but |
  | 51 | no | but |
  | 55 | no | but |
  | 56 | no | — |
  | 92 | no | and |
  | 93 | no | and |
  | 100 | no | and |

  Also: `yes=90, extreme=15`, roll 88 → `{yes, but}`; roll 10 → `{yes, and}`. `askOracle` returns two non-empty meaning words and is deterministic per seed. `drawMove` never returns an id in `exclude`; when everything is excluded, it ignores `exclude` rather than failing.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): oracle and GM moves deck`.

---

### Task 11: Starter content packs, snapshot fixture and benchmark

**Files:**
- Create: `packages/content-core/{package.json,LICENSE-CONTENT,src/moves.yaml}`
- Create: `packages/content-fantasy/{package.json,LICENSE-CONTENT,CONTRIBUTING.md,src/vocabulary.yaml,src/cultures/{marsh,highland,imperial}.yaml,src/tables/npc/{role,look,want,secret,tell}.yaml,src/generators/npc.yaml,src/oracle/{oracle,meaning-action,meaning-theme}.yaml}`
- Create: `packages/engine/test/packs.test.ts`, `packages/engine/bench/generate.bench.ts`

**Interfaces:**
- Produces: `@prepdesk/content-core` exporting `dist/core.json` (id `core`, deck `core.gm-moves`); `@prepdesk/content-fantasy` exporting `dist/fantasy.json` (id `fantasy`, generator `fantasy.npc`, cultures `fantasy.culture.{marsh,highland,imperial}`, oracle `fantasy.oracle`).
- Content requirements (spec §4.9):
  - **Cultures:** Marsh-folk (voice "slow vowels, drop the final g, never says no"), Highland ("clipped, hard consonants, rhetorical questions"), Imperial coast ("formal, full titles, a little too polite"). Each has 8+ examples, 3 voice tips, and name parts able to pass the `weak-culture` lint.
  - **NPC tables:** role, look, want, secret, tell, ~20 entries each, every sensitive entry tagged from the safety vocabulary.
  - **Generator `fantasy.npc`:** fields exactly as in spec §4.2, `display: "{name}, {role|a}"`.
  - **Oracle:** odds exactly as in spec §4.2; two meaning tables of 30 words each.
  - **Deck:** 12 original GM moves, each with `text` + `prompt`.
  - **CONTRIBUTING.md:** entry length (≤ 1 short sentence), tone, original-writing rule, safety tagging guidance with examples.

- [ ] **Step 1: Write failing tests** in `packs.test.ts`, loading `dist/core.json` + `dist/fantasy.json` (built in a `globalSetup` via `pnpm content:build`):
  - Both lint clean.
  - `generate(lib,'fantasy.npc',{seed:'TEST-0001',context:{cultureId:'fantasy.culture.marsh'}})` matches its snapshot.
  - Each culture yields 20 distinct names.
  - With `lines` = the full safety vocabulary, generating 1,000 NPCs never throws (blocked fields allowed).
  - `drawMove(lib,'core.gm-moves')` works.
- [ ] **Step 2: Run** → FAIL (packs missing).
- [ ] **Step 3: Write the content.** Write the benchmark: `generate` NPC and a 60-item `batch` (6 NPCs + 30 names + 24 table rolls), reporting mean times (soft target: NPC < 5 ms, batch < 25 ms).
- [ ] **Step 4: Run** `pnpm content:lint && pnpm --filter @prepdesk/engine test && pnpm --filter @prepdesk/engine bench --run` → PASS, with benchmark numbers printed.
- [ ] **Step 5: Commit** `feat(content): fantasy starter and core moves packs; engine snapshot + bench`.

---

### Task 12: Web app shell, tokens, fonts and theme

**Files:**
- Create: `apps/web/{index.html,vite.config.ts,package.json,tsconfig.json}`, `src/main.tsx`, `src/app/{App.tsx,routes.tsx,TopBar.tsx,ModeShell.tsx,theme.ts,ThemeProvider.tsx}`, `src/styles/{tokens.css,base.css,fonts.css}`
- Test: `apps/web/src/app/__tests__/theme.test.ts`, `apps/web/src/app/__tests__/routes.test.tsx`

**Interfaces:**
- Produces:
  - `type ThemeChoice = 'light' | 'dark' | 'system'`
  - `readTheme(storage?: Pick<Storage,'getItem'>): ThemeChoice` / `writeTheme(choice, storage?): void` (both swallow exceptions; default `'system'`)
  - `ThemeProvider` sets `document.documentElement.dataset.theme` (removed for `system`); `useTheme(): { choice, setChoice }`
  - `ModeShell({ title, description })`: empty-state screen for `/prep`, `/table`, `/codex`, `/forge` with links to the others
  - Dev routes registered only when `import.meta.env.DEV`: `/kit`, `/forge-preview`
- `tokens.css` holds every token in spec §3.2 with the exact palette and font-role variables. `fonts.css` imports `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/instrument-sans`, `@fontsource-variable/shantell-sans`, `@fontsource/jetbrains-mono/500.css` and `600.css`. `base.css` sets the body background `var(--paper)`, the dotted paper texture, the focus ring rule and a `prefers-reduced-motion` reset.
- `TopBar`: wordmark, mode links, theme toggle (`IconButton` from Task 13, a plain button until Task 13 lands); collapses into a menu button below 768px.

- [ ] **Step 1: Write failing tests**
  - `readTheme` returns the stored choice; with no storage → `'system'`.
  - Review Focus 5: `readTheme` and `writeTheme` with a storage whose methods throw do not throw and return `'system'`; `setChoice('dark')` still applies `data-theme="dark"` for the session.
  - Routes test: rendering each of `/prep`, `/table`, `/codex`, `/forge` shows its title.
- [ ] **Step 2: Run** `pnpm --filter web test` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, and `pnpm --filter web build` succeeds.
- [ ] **Step 5: Commit** `feat(web): app shell, Ink & Index tokens, self-hosted fonts, theme`.

---

### Task 13: Kit components, part 1 (surfaces and marks)

**Files:**
- Create: `apps/web/src/kit/{InkFilter,InkOutline,Card,Button,IconButton,Chip,Stamp,Highlight,MarginNote,SectionLabel,Icon}.tsx`, `kit.css`, `index.ts`
- Test: `apps/web/src/kit/__tests__/part1.test.tsx`

**Interfaces:**
- Produces (props):
  - `InkFilter({ id = 'ink-rough', seed = 7 })`: renders a hidden `<svg>` holding `feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2"` + `feDisplacementMap scale="2.6"`; mounted once in `App`
  - `InkOutline({ radius = 4 })`: `aria-hidden` absolutely positioned border layer using `filter:url(#ink-rough)`
  - `Card({ variant = 'plain' | 'ruled' | 'taped', tilt = 0, as = 'article', children })`: `tilt` is clamped to [−1, 1] degrees
  - `Button({ variant = 'solid' | 'outline' | 'dashed', size = 'md' | 'lg', ...buttonProps })`: `md` height 44px, `lg` height 68px
  - `IconButton({ icon: IconName, label: string, ...buttonProps })`: `aria-label={label}` plus a `title` tooltip, 44×44
  - `Chip({ children, onRemove?, removeLabel? })`
  - `Stamp({ children, tone = 'stamp' | 'pencil', rotate = 7 })`
  - `Highlight({ children, struck = false })`
  - `MarginNote({ children, arrow?: 'right' | 'left' })`
  - `SectionLabel({ children, as = 'span' })`
  - `type IconName = 'name'|'npc'|'place'|'twist'|'treasure'|'encounter'|'map'|'search'|'moon'|'sun'|'lock'|'unlock'|'dice'|'copy'`; `Icon({ name, size = 22 })`: inline stroke SVG, `aria-hidden`

- [ ] **Step 1: Write failing tests:** `IconButton` exposes an accessible name equal to `label`; `Button size="lg"` has class `btn--lg` and `size="md"` has `btn--md` (kit.css maps these to 68px and 44px); `Card tilt={5}` renders `rotate(1deg)`; `Highlight struck` has class `hl--struck`; `InkOutline` is `aria-hidden`; every `IconName` renders an `<svg>`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (styles in `kit.css` using tokens only, with no raw hex values). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): Ink & Index kit, surfaces and marks`.

---

### Task 14: Kit components, part 2 (controls) and the `/kit` page

**Files:**
- Create: `apps/web/src/kit/{Tabs,Clock,Field,DockButton}.tsx`, `apps/web/src/dev/KitPage.tsx`
- Modify: `apps/web/src/kit/index.ts`, `apps/web/src/kit/kit.css`
- Test: `apps/web/src/kit/__tests__/part2.test.tsx`

**Interfaces:**
- Produces:
  - `Tabs({ tabs: {id: string; label: string}[], value: string, onChange(id) , label: string })`: `role="tablist"`, roving tabindex, ←/→/Home/End
  - `Clock({ segments: 4 | 6 | 8, filled: number, label: string, onTick?: () => void })`: SVG wedges, `role="img"`, `aria-label="Clock: {filled} of {segments}"` (prefixed by `label`); when `onTick` is set, a 44px "Tick +1" button follows; `filled` is clamped to [0, segments]
  - `Field({ label, multiline?, hand?, ...inputProps })`: a visible `<label>` bound via `useId`; `hand` uses `--font-hand`
  - `DockButton({ icon: IconName, label, onClick })`: 82×68 tile
  - `KitPage`: every component and variant from Tasks 13–14, in two side-by-side sections forced to `data-theme="light"` and `data-theme="dark"`

- [ ] **Step 1: Write failing tests:** Tabs moves focus and selection with ArrowRight/ArrowLeft/Home/End and calls `onChange`; `Clock segments={6} filled={3} label="The Tide Rises"` has accessible name `"The Tide Rises. Clock: 3 of 6"`; `filled={9}` clamps to 6; with `onTick`, clicking "Tick +1" calls it; Field's input is found via `getByLabelText(label)`; DockButton has an accessible name equal to `label`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm --filter web dev`, then open `/kit` and check both theme columns render.
- [ ] **Step 5: Commit** `feat(web): Tabs, Clock, Field, DockButton and /kit page`.

---

### Task 15: PWA, offline and update chip

**Files:**
- Modify: `apps/web/vite.config.ts`, `apps/web/src/app/App.tsx`
- Create: `apps/web/src/app/UpdateChip.tsx`, `apps/web/public/icons/{icon-192.png,icon-512.png,maskable-512.png}` (generated from an inked d20 SVG source `public/icons/icon.svg`)
- Test: `apps/web/src/app/__tests__/UpdateChip.test.tsx`

**Interfaces:**
- Consumes: `virtual:pwa-register/react` (`useRegisterSW`).
- Produces:
  - vite-plugin-pwa config: `registerType: 'prompt'`; Workbox `globPatterns: ['**/*.{js,css,html,woff2,json,svg,png}']`; `navigateFallback: 'index.html'`
  - Manifest: `name: 'Prep Desk'`, `short_name: 'Prep Desk'`, `display: 'standalone'`, `theme_color: '#1F1B16'`, `background_color: '#F3EDE1'`, `orientation: 'any'`, plus the icons above
  - `UpdateChip({ needRefresh: boolean, onReload: () => void, onDismiss: () => void })`: a presentational chip, "Update ready" + "Reload" + dismiss, rendered by `App` from `useRegisterSW`

- [ ] **Step 1: Write failing tests:** `UpdateChip` renders nothing when `needRefresh` is false; when true, it shows "Update ready" and clicking "Reload" calls `onReload` exactly once; it **never** calls `onReload` on mount (no auto-reload).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; `pnpm --filter web build` lists the precached font files in the output manifest.
- [ ] **Step 5: Commit** `feat(web): installable PWA with offline precache and update chip`.

---

### Task 16: `/forge-preview` dev page

**Files:**
- Create: `apps/web/src/dev/engine.ts`, `apps/web/src/dev/ForgePreview.tsx`
- Test: `apps/web/src/dev/__tests__/ForgePreview.test.tsx`

**Interfaces:**
- Consumes: the engine public API (Task 9 `generate`, `reroll`, `cardToShare`, `cardFromShare`, `batch`; Task 8 `generateName`; Task 10 `askOracle`, `drawMove`; Task 3 `SAFETY_VOCABULARY`), compiled `core.json` + `fantasy.json`, and the kit.
- Produces:
  - `engine.ts`: `export const lib = loadPacks([core, fantasy])`
  - `ForgePreview` sections (spec §4.10):
    1. Culture `Tabs` + "New NPC" (`Button`), with the NPC rendered in a `Card variant="ruled"`, each field with a lock `IconButton` (label "Lock {field}" / "Unlock {field}"), a "Reroll" `Button`, the share code text, a copy `IconButton`, and a "Paste a code" `Field` + "Load" button.
    2. A names strip: 10 names with voice summaries, plus an "Avoid names" `Field` (comma-separated → `avoidNames`).
    3. Oracle: likelihood `Tabs`, "Ask" → answer, modifier and meaning pair.
    4. "Draw a move" → move text + prompt.
    5. Safety: a checkbox list of the vocabulary with Line / Veil toggles feeding `context.safety`; veiled fields shown with a `Stamp tone="pencil"` reading "VEILED".

- [ ] **Step 1: Write failing tests**
  - New NPC → lock "name" → Reroll: the name text is unchanged and at least one other field changed.
  - Copy the share code, generate a new NPC, paste the code and Load: all field texts match the earlier card.
  - Review Focus 1: pasting `"  k7q2m9xd  "` loads a card (forgiving input); pasting `"nonsense"` shows the alert text `That code doesn't look right. Check it and try again.` and leaves the current card in place.
  - Ticking Line on every vocabulary tag and generating does not crash.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): /forge-preview wires engine to the kit`.

---

### Task 17: End-to-end, accessibility and offline checks in CI

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/{routes,kit,forge,offline}.spec.ts`
- Modify: `.github/workflows/ci.yml` (add the `e2e` job: build, `vite preview` on port 4173, Playwright with `--trace off`)

**Interfaces:**
- Consumes: the built app (`pnpm --filter web build && pnpm --filter web preview`). Dev routes must be reachable in e2e: build with `--mode e2e` and treat `import.meta.env.MODE === 'e2e'` like DEV when registering `/kit` and `/forge-preview` (update `routes.tsx`).
- Projects: `tablet-landscape` (1194×834, primary), `tablet-portrait` (834×1194), `desktop` (1440×900), `phone` (390×844).

- [ ] **Step 1: Write the specs**
  - `routes.spec`: every route renders its title, and `document.documentElement.scrollWidth <= window.innerWidth` on all four projects.
  - `kit.spec`: on `tablet-landscape`, an axe scan of `/kit` reports zero `serious` or `critical` violations; screenshots saved for the light and dark sections.
  - `forge.spec`: the lock → reroll → copy → paste → identical-card flow from Task 16, in a real browser.
  - `offline.spec`: load `/`, wait for the service worker to be `activated`, set `context.setOffline(true)`, reload; `/table` still renders with fonts loaded (`document.fonts.check('16px "Instrument Sans Variable"')` is true).
- [ ] **Step 2: Run** `pnpm e2e` locally → expect failures only where real bugs exist; fix them in their owning files.
- [ ] **Step 3: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm content:lint && pnpm build && pnpm e2e` → all PASS.
- [ ] **Step 4: Commit** `test(web): e2e, accessibility and offline checks in CI`.
- [ ] **Step 5: Push** the branch and confirm the CI run is green.
