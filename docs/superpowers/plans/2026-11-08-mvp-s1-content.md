# MVP Slice S1 (Content) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `situation` content kind (tag pairs) to the engine, wire all 14 new fantasy generators, and fill every table to the spec's counts. The content must be original, safety-tagged and quality-reviewed, and every roll must still go through `selectEntry`.

**Architecture:** S1a (Tasks 1–7) is engine and wiring. `compileDocs` turns each situation into six ordinary facet tables plus one entry in a pack-level index table. Two new field sources (`situation`, `facet`) roll those tables through the existing `rollInto` → `selectEntry` path, in a dependency-first field order. Fourteen generator YAMLs run against real 8-entry tables. S1b (Tasks 8–20) raises each table family to the spec counts. A table-driven content spec, written in Task 5, gates every content task: counts, strict-lines coverage, distinctness, a stem-based safety audit, determinism and a 10,000-generation safety property. Task 21 adds a generator picker to `/forge-preview` and proves the slice from a clean clone.

**Tech Stack:** TypeScript (strict), zod, yaml, Vitest (unit, property, file snapshots, bench), Playwright + @axe-core/playwright, React 18 (dev page only), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-08-mvp-design.md`. This plan covers §4 (S1) only, plus §2, §3.5, §9, §11 and §12, and decisions D1, D2, D3, D11 and D41. The foundations spec `docs/superpowers/specs/2026-11-08-foundations-and-content-engine-design.md` still binds.

## Preflight: P0 must be merged first

S1 starts only after the P0 batch is merged on the branch. The controller checks this before dispatching Task 1:

- `grep -n "serializeCard\|parseCard\|applySafety\|cardToShare" packages/engine/src/index.ts` → all four are exported.
- `grep -n "hidden?:" packages/engine/src/generate.ts` → `CardField.hidden` exists.
- `grep -n "safety" packages/engine/src/schema.ts | grep -i deck` → deck cards accept `safety`.
- `drawMove` takes `{ safety }`, and `MoveCard` has `safety`/`veiled`.

If a delivered signature differs from spec §2.2, the delivered one wins. Implementers adapt call sites and keep the semantics.

Three tasks depend directly on P0:

- Tasks 2 and 3 edit `generate.ts` (`assemble`, `genField`, `applySafety`) as P0 left it.
- Task 20 depends on deck `safety`.
- Task 21 depends on P0's ForgePreview.

Anchor every edit on function names, not line numbers.

## Global Constraints

**From CLAUDE.md and spec §2.1 (verbatim values):**

- Engine boundary: `packages/engine` imports nothing from the repo and no DOM types. The only runtime dependencies are `zod` and `yaml`. The web app imports compiled JSON packs only.
- Safety beats everything. Lines are never selected, never relaxed, and they override locks. Any content entry that touches a topic in the safety vocabulary must carry its tag. When unsure, tag it.
- Safety vocabulary (exact): `violence, gore, death, torture, sexual-content, abuse, child-harm, self-harm, suicide, addiction, slavery, body-horror, insects, spiders, rats, drowning, fire, claustrophobia, religion, hate-bigotry, animal-harm, pregnancy, mental-illness, police, war`. Default lines: `['child-harm']`. Never write `child-harm` content.
- Strict-lines fixture (spec §4.6): `violence, death, fire, drowning, religion, spiders, insects, rats, war`.
- Original content only. Nothing is copied or lightly reworded from any published game, book, site or generator. Content is CC-BY-4.0.
- Ids are namespaced and lowercase. Situations live under `<pack>.situation.<slug>`; generators are `fantasy.*`.
- Field references (`{name}`) appear only in a generator's `display`, never in `template` fields.
- Context keys the content may read (§4.1): `ctx.settlement.name`, `ctx.front.name`, `ctx.place.name`, `ctx.mention.name`, `ctx.pc.name`, `ctx.pc.want`, `ctx.truth.text`. Every use carries an `or:` fallback.
- Voice (§11): warm, sentence case, no exclamation marks, no "AI" and no "generate" anywhere. The verb for randomness is **Roll**.
- Writing rules (§4.5) apply to every entry:
  - one breath, specific, playable, and fits the slot;
  - each table's `title` states the sentence it completes;
  - at most about 30% of any table's entries carry safety tags;
  - no duplicates in spirit, including across `rumor.text` and `secret.text`.
- TDD: write the test, watch it fail, then implement. Every bug fix gets a test.
- Before every commit, run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage`. Coverage must stay ≥ 90%.
- Commit after each task and never commit failing tests. Stage explicit paths only (other helpers commit in parallel), and retry if the index is locked. Never push. The controller pushes and checks the real CI run.

**Binding rulings, copied verbatim from the ledger:**

- Ruling R2: Engine compile/lint unit tests use inline JS document arrays (no filesystem); the YAML fixture dirs in tools/content-cli/test/fixtures are exercised by the CLI test (table-driven, one expected error code per dir) — keeps engine free of repo deps — cost if wrong: some duplicated fixture content.
- Ruling R3: `compileDocs` resolves short slot refs to absolute ids at compile time (same-pack namespace first, then absolute), so ASTs in compiled packs only contain absolute ids; runtime lookup (Library.table) is by absolute id only (the optional `fromPack` param is dropped) — one resolution point — cost if wrong: user packs must be compiled via validateUserPack (they already are).
- Ruling R6: Subagent commits use the attribution trailer from the subagent's own harness reminder (it names the model that actually authored the commit), falling back to the session lines — accurate authorship — cost if wrong: trailer text varies across commits.
- Ruling R8: CompiledCulture hoists examples/exampleChance/banned to top level, names = {given, family?, format?}; source keeps them under names (spec YAML) — accepted as the compiled shape for Tasks 5/8 — cost if wrong: small refactor in compile.
- Ruling R9 (Task 5 dispatch): compileDocs(manifest, docs: Array<{file: string; data: unknown}>, deps?: CompiledPack[]) — deps needed at compile time for R3 short-ref resolution. Short ref resolution order for a ref inside owner id `a.b.c`: sibling `a.b.<ref>`, then pack-level `<packId>.<ref>`, then the ref as an absolute id (this pack or deps). Tag vocabulary = union of this pack's vocabulary docs and deps' vocabularies; a tag not in it → unknown-tag. ContentError.path = `<file>` plus a JSON-path-ish suffix (e.g. `src/tables/npc/want.yaml#entries[3]`). CLI runs via tsx. weak-culture rule stays it.todo until Task 8 — cost if wrong: minor API churn.
- Ruling R10 (Task 5 concerns): In a generator's `display` and `template` fields, a slot naming one of that generator's own fields is a FIELD reference: table slots whose ref equals a field name stay short, and `{name}`/`{name:...}` name slots with part `full` render the field `name` when the generator has a `name` field. Runtime (Task 9) resolves field refs before tables/names — matches the spec example `display: "{name}, {role|a}"` — cost if wrong: a table literally named like a field can't be referenced short from display (use absolute id).
- Ruling R11 (Task 5 concerns, pre-review adjustment): compiled generator `template` field sources carry a TemplateAst (not a re-serialised string) — change the compiled type; and short refs owned by a generator resolve `<generatorId>.<ref>` FIRST, then R9 order — so `{table: role}` in fantasy.npc → fantasy.npc.role — cost if wrong: small compile change.
- Ruling R12 (from Task 5 review): validateUserPack (Task 9) returns compileDocs errors only — compileDocs already runs every lint rule; calling lintPack too would double-report — cost if wrong: none.
- Ruling R13 (from Task 5 review, carried to Task 6/9): ids must match /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)+$/ (namespaced, no __proto__); compile reports a `schema` error otherwise. Task 6 (Library) builds its maps with null-prototype objects/Map. Implement the id check in Task 6's dispatch (small compile.ts change) — cost if wrong: authors must use lowercase ids.
- Ruling R14 (Task 6 review): genre filter is relaxed LAST (after exclude) with relaxed:true when it alone empties the pool — spec §4.6 'never return nothing for a non-empty table'; blocked:true only when safety lines empty an otherwise non-empty pool — cost if wrong: off-genre entry may appear (flagged relaxed).
- Ruling R15 (Task 7 dispatch): RenderEnv gains optional `fields?: Record<string, string>` implementing R10 at render time — a table slot whose ref is a key of `fields`, or a name slot with part 'full' when `fields.name` exists, renders the field value (modifiers still apply). Task 9 passes it for display/template fields — cost if wrong: small signature change.
- Ruling R16 (Task 8 concern): culture `banned` regexes match case-insensitively (flag i) — authors write 'aa' to ban 'Aaral' too — cost if wrong: authors needing case-sensitive bans can't express them.
- Ruling R19 (Task 9 dispatch): if ctx.cultureId is absent, generate() picks a culture deterministically from the card rng among library cultures matching ctx.genre (all cultures if none match) and records it in card.context.cultureId; Card.context stores only JSON-serialisable context (campaign hook dropped); each name-sourced field generates independently via nameWithRng with its own field rng; `{name}` slots inside non-display templates call resolveName (a fresh culture name); one warn-dedup Set is shared across a whole generate/batch call — cost if wrong: NPC culture varies when unspecified (recorded, reproducible).
- Ruling R20 (Task 9 concerns): accepted as known limits — share codes reproduce a card from its own seed/nonces, not batch-shared exclusion state; locked fields' relaxed flag recomputed under current context; generation always renders in prod mode (missing → '' + one warn) — cost if wrong: a shared batch NPC may get a different name when rebuilt from its code alone.
- Ruling R21 (Task 9 review): a seed that normalizeSeed rejects is mapped deterministically to a valid 8-char Crockford seed derived from hashSeed(input) (so 'dragon' works and stays shareable); same for rollTable/batch — cost if wrong: free-text seeds differ from other tools.
- Ruling R22 (Task 9 review): safety beats locks — on generate/reroll/cardFromShare, a kept (locked) field whose sources include an entry carrying a CURRENT safety line becomes {value:'—', blocked:true, locked:true} and the card display shows the blocked text — spec §4.7 'never selected' outranks §4.4 lock — cost if wrong: DM loses a locked value after adding a line (intended).
- Ruling R23 (Task 9 review): field references (R10) are allowed only in a generator's `display`; a `template` field that references another field is a lint error (code 'unresolved-ref', message explains to use display) — guarantees exact share — cost if wrong: authors can't compose fields inside templates (use display).
- Ruling R25 (Task 11 dispatch): content `dist/` stays gitignored; root `build` runs `content:build` first and the engine test globalSetup builds packs, so compiled JSON always exists where needed; content packages expose `./core.json` / `./fantasy.json` via package.json `exports` pointing at dist — cost if wrong: CI order dependency.
- Ruling R29: every root script must work from a clean checkout. Root `typecheck` becomes `pnpm content:build && pnpm -r --if-present run typecheck` (typecheck needs compiled packs); CI `verify` job order stays lint → typecheck → test → content:lint → build (no reliance on prior steps' leftovers); the e2e job runs `pnpm build` itself. Acceptance = a FRESH `git clone` of the branch into the scratchpad, `pnpm install --frozen-lockfile`, then each CI step in CI order, all green — cost if wrong: typecheck takes ~1 s longer.
- Ruling R30 (Task 17 review, Important): CI uses Node 22 in BOTH jobs — @axe-core/playwright@4.14.0 requires Node >=22.12 (pnpm only warns), Node 20 is out of support, local dev is Node 22.23 so a clean-clone proof could not exercise Node 20 anyway; add .nvmrc (22), root `engines.node` >=22.12, CLAUDE.md wording — cost if wrong: contributors on Node 20 must upgrade.
- Process rule (controller, adopted after the red CI): check the real GitHub Actions run after EVERY push; a task is complete only when its commit's CI run is green. Final review starts only after CI is green.
- R27 (share codes carry no culture) is **superseded** by P0 share code v2, which puts the culture inside the code. R4 and R31 bind only Task 21 (UI).

**Decisions this plan makes where the spec is silent (binding for all tasks):**

- **S1-1. Facet sources.** A facet field's `sources` are `[<index entry id>, <facet entry id>, ...nested]`. When a line covers a situation, its locked facets and the facets that `applySafety` re-checks block through the existing `guard`/`safetyOf`, and they come back when the line is removed.
- **S1-2. `distinctFrom`.** It reuses `rollInto`'s `exclude` set (the `pick` mechanism). If no eligible entry is left after exclusion, the field is **blocked** (`—`). It never repeats `a` and never relaxes a line.
- **S1-3. Field order.** Fields generate in a stable dependency-first order: repeatedly take the first declared field whose `of`/`distinctFrom` dependencies are done. Fields left in a cycle (lint prevents this, and a user pack built around lint must not throw) follow in declared order. A facet whose `of` field is not done yet counts as blocked, and `distinctFrom` with no done target excludes nothing. `card.fields` is always re-keyed in **declared** order, because share codes and `serializeCard` read key order.
- **S1-4. Index table.** `<packId>.situations` exists only when the pack has at least one situation. Its title is `"Situations"`, its tags are `[]`, and its entries carry `ref`. Each situation lists `situation` first in its `tags`, so the `situation` vocabulary tag is used.
- **S1-5. Situation weight and genre.** `weight` (default 1) is optional on situation sources. `CompiledSituation.genre` is copied from the manifest's `genre` when present.
- **S1-6. Error paths.** Errors on facet entries point at `<file>#facets.<facet>[<i>]`, and errors on the situation's own tags and safety point at `<file>`.
- **S1-7. New lint codes.**
  - A situation id not under `<pack>.situation.` → `namespace`.
  - `of` or `distinctFrom` naming a missing or non-`situation` field → `missing-source`.
  - A `situation` source whose table has an entry without `ref` → `missing-source`.
  - A field dependency cycle → `cycle`.
  - A culture example or voice tip matching a safety stem → new code `culture-safety`.
- **S1-8. Blank context.** The `or:` fallback also fires on whitespace-only values (`'  '`). This is a `render.ts` change.
- **S1-9. Free-text context keys.** `ctx.pc.want` and `ctx.truth.text` may appear only at the very end of an entry. Clue tables don't read `ctx.truth.text`, because the app shows the truth beside the clue.
- **S1-10. Pack versions.** Both content packs move to `0.2.0` at the end of S1 (D46), because S1 changes every card the packs produce.
- **S1-11. Out of scope.** `apps/web/src/dev/engine.ts` stays where it is; the move to `content/lib.ts` (§2.3.3) belongs to S2. Duplicate entries across one Pocket batch belong to S3's `buildPocket`.

## Review Focus

1. **Strict lines leave a seed, encounter or Pocket card mostly `—`.** A DM with the strict-lines fixture expects every generator to keep producing real text. Covered by the strict-lines gates in Task 5 (≥ 12 eligible per Pocket-feeding table, ≤ 40% lost per table, ≤ 1 strict-lined entry per facet, ≥ 10/20 situations eligible), re-run in every content task, and by the all-lines property in Task 5.
2. **Blank or whitespace context values** (`ctx.front.name = '  '`) render as gaps such as "pays twice to   for maps". The DM expects the fallback text. Covered by Task 4 (blank-aware `or:`) and the blank-context property in Task 5.
3. **Adding and then removing a line on a situation** must restore the situation and every facet that depends on it, locked or not, with no reshuffle. Covered by Task 2 (unit) and Task 3 (property, `applySafety` round trip).
4. **Article and capitalisation glitches** ("a ash-pit", "an one-eyed…", "Ashford, a the ferry", a display starting in lower case) look broken. Covered by Task 5's article rule and display sanity check.
5. **DM free text with its own punctuation lands mid-sentence** ("needing to find her brother. and…"). Covered by Task 5's DM-shaped context property and decision S1-9.

---

## File Structure

```
packages/engine/src/
  schema.ts         + FACETS, Facet, SituationSrc, CompiledSituation, CompiledEntry.ref,
                      CompiledPack.situations, situation/facet field sources
  compile.ts        + situation compile (facet tables, index table, pack.situations)
  lint.ts           + entryPath callback, situation/facet field rules, field cycles, culture-safety
  library.ts        + situation(id), situations in the cross-kind clash check
  situations.ts     NEW: fieldDeps, fieldOrder, inDeclaredOrder, rollSituation, rollFacet
  generate.ts       assemble/applySafety use fieldOrder; genField gets the done fields
  render.ts         or: fires on whitespace-only values
  safetyStems.ts    NEW: SAFETY_STEMS, stemHits
  errors.ts         + 'culture-safety'
  index.ts          new exports
packages/engine/test/
  situations.test.ts                NEW (compile, lint, generate)
  fixtures/situation-pack.ts        NEW
  safety.property.test.ts           extended (situations)
  safetyStems.test.ts               NEW
  fixtures/content-spec.ts          NEW: TABLE_SPEC and the other gate inputs
  packs.test.ts                     extended: counts, strict lines, 1,000-generation sweep, snapshots
  content.quality.test.ts           NEW: distinctness, length, case, articles, ctx, audit, tags
  content.property.test.ts          NEW: determinism, 10,000-generation lines, all lines, DM/blank ctx
  tools/audit-list.ts               NEW: prints the safety-audit sheet for given tables
  fixtures/__snapshots__/<generatorId>.json   one per new generator
packages/engine/bench/generate.bench.ts      + Pocket-shaped batch
tools/content-cli/test/fixtures/{situation-facets,situation-namespace,facet-ref,field-cycle,culture-safety}/
packages/content-fantasy/
  src/vocabulary.yaml · CONTRIBUTING.md · package.json (0.2.0)
  src/generators/{place,settlement,tavern,shop,rumor,secret,clue,complication,trinket,
                  treasure,seed,encounter,prep-spotlight,prep-pressure}.yaml
  src/tables/{place,settlement,tavern,shop,rumor,secret,clue,complication,trinket,
              treasure,encounter,prep}/<name>.yaml
  src/situations/<slug>.yaml (20)
  src/oracle/meaning-*.yaml · src/cultures/*.yaml
packages/content-core/src/moves.yaml · package.json (0.2.0)
apps/web/src/dev/ForgePreview.tsx (+ forge.css) · src/dev/__tests__/ForgePreview.test.tsx
apps/web/e2e/generators.spec.ts (NEW) · e2e/targets.spec.ts
```

---

## S1a: engine and generator wiring

### Task 1: Situation content kind (schema, compile, library)

**Files:**

- Modify: `packages/engine/src/schema.ts`, `compile.ts`, `lint.ts`, `library.ts`, `index.ts`
- Create: `packages/engine/test/fixtures/situation-pack.ts`, `packages/engine/test/situations.test.ts`
- Modify: the literal-pack fixtures in `test/names.test.ts`, `shareCard.test.ts`, `lint.test.ts`, `select.test.ts` and `render.test.ts` (add `situations: {}`)
- Create: CLI fixtures `tools/content-cli/test/fixtures/situation-facets/` and `situation-namespace/` (`package.json`, `src/tables.yaml` holding the situation, `src/vocab.yaml`). Add both rows to the `failing` table in `tools/content-cli/test/cli.test.ts`.

**Interfaces:**

- Consumes: `compileDocs`, `lintWith`, `loadPacks` (existing).
- Produces:
  - `export const FACETS = ['enemy', 'friend', 'complication', 'thing', 'place', 'pressure'] as const; export type Facet = (typeof FACETS)[number];`
  - `SituationSrc`: `kind: 'situation'`, `id`, `title`, `summary`, optional `weight`, `tags` (default `[]`), `safety` (default `[]`), and `facets`. `facets` is a strictObject with all six keys, each `z.array(EntrySrc).min(3)`. Add it to `DocumentSrc`; `export type SituationSource`.
  - `type CompiledSituation = { id: string; title: string; summary: string; genre?: string; tags: string[]; safety: string[]; facets: Record<Facet, string> }`
  - `CompiledEntry.ref?: string` (set only on index entries)
  - `CompiledPack.situations: Record<string, CompiledSituation>` (compile always emits it; `loadPacks` reads `pack.situations ?? {}`)
  - `Library.situation(id: string): CompiledSituation | undefined`
  - `lintWith(pack, deps, locate, entryPath?: (tableId: string, index: number) => string)`. The default is `${locate('table', id)}#entries[${i}]`, and `LintKind` gains `'situation'`.

- [ ] **Step 1: Write the fixture** `test/fixtures/situation-pack.ts`:

```ts
export const situationManifest = { id: 's', version: '1', title: 'Situations' };
const facets = (slug: string, tag?: { facet: Facet; safety: string }) =>
  Object.fromEntries(
    FACETS.map((f) => [
      f,
      [1, 2, 3].map((n) => ({
        text: `${slug} ${f} ${n}`,
        ...(tag?.facet === f && n === 1 ? { safety: [tag.safety] } : {}),
      })),
    ]),
  );
export const situationOnlyDocs = [
  { kind: 'vocabulary', tags: ['situation', 'coastal', 'trade'] },
  { kind: 'situation', id: 's.situation.ember-toll', title: 'Ember toll', summary: 'A toll paid in coal.', tags: ['situation', 'trade'], safety: ['fire'], facets: facets('ember') },
  { kind: 'situation', id: 's.situation.bell-debt', title: 'Bell debt', summary: 'The chapel bell is pawned.', tags: ['situation'], safety: ['religion'], facets: facets('bell') },
  { kind: 'situation', id: 's.situation.reed-vow', title: 'Reed vow', summary: 'A promise made on the water.', tags: ['situation', 'coastal'], facets: facets('reed', { facet: 'enemy', safety: 'rats' }) },
];
export const asDocs = (data: unknown[]) => data.map((d, i) => ({ file: `d${i}`, data: d }));
```

- [ ] **Step 2: Write the failing compile tests** in `situations.test.ts` (`describe('compile situations')`):

```ts
const { pack, errors } = compileDocs(situationManifest, asDocs(situationOnlyDocs));
expect(errors).toEqual([]);
expect(pack.tables['s.situation.ember-toll.enemy']).toMatchObject({ id: 's.situation.ember-toll.enemy', title: 'Ember toll: enemy', tags: ['situation', 'trade'] });
expect(pack.tables['s.situation.ember-toll.enemy']?.entries.map((e) => e.id)).toEqual(['s.situation.ember-toll.enemy#0', 's.situation.ember-toll.enemy#1', 's.situation.ember-toll.enemy#2']);
expect(pack.tables['s.situations']?.entries[0]).toEqual({ id: 's.situations#0', ast: ['Ember toll'], weight: 1, tags: ['situation', 'trade'], safety: ['fire'], ref: 's.situation.ember-toll' });
expect(pack.tables['s.situations']?.entries.map((e) => e.ref)).toEqual(['s.situation.ember-toll', 's.situation.bell-debt', 's.situation.reed-vow']);
expect(pack.situations['s.situation.reed-vow']).toEqual({ id: 's.situation.reed-vow', title: 'Reed vow', summary: 'A promise made on the water.', tags: ['situation', 'coastal'], safety: [], facets: Object.fromEntries(FACETS.map((f) => [f, `s.situation.reed-vow.${f}`])) });
expect(loadPacks([pack]).situation('s.situation.bell-debt')?.title).toBe('Bell debt');
```

  Error cases. Each asserts `errors.map((e) => [e.code, e.path])` exactly:
  - The `enemy` facet with 2 entries → `[['schema', 'd1#facets.enemy']]`.
  - `pressure` facet missing → `[['schema', 'd1#facets.pressure']]`.
  - Id `s.ember-toll` → `[['namespace', 'd1#id']]`.
  - The same situation twice → `[['duplicate-id', 'd4']]`.
  - An authored table `s.situation.ember-toll.enemy` → one `duplicate-id`.
  - A facet entry with safety `spooky` → `[['unknown-safety-tag', 'd1#facets.enemy[1]']]`.
  - Situation tags `['swamp']` → `[['unknown-tag', 'd1']]`.
  - A pack with no situations has no `s.situations` table and `situations: {}`.
  - `loadPacks`: a second pack with a table whose id equals a situation id throws `duplicate-id`, and `select-pack.json` (no `situations` key) still loads.
  - A facet entry `'{coin}'`, with sibling table `s.situation.ember-toll.coin` authored, resolves to that absolute id (R9 from owner `<situationId>.<facet>`).
- [ ] **Step 3: Run** `pnpm --filter @prepdesk/engine test situations` → FAIL (`kind: situation` is rejected by the schema).
- [ ] **Step 4: Implement.**
  - Schema per Interfaces.
  - In `compileDocs`, collect situations, check the `<packId>.situation.` prefix, and mark the derived table ids (six facet ids, plus the index id) in `seen` as `table:` keys so clashes report `duplicate-id`.
  - Emit the facet tables (entries parsed and resolved with owner `<situationId>.<facet>`) and the index table, per S1-4/S1-5.
  - Pass `entryPath` to `lintWith` for facet and index entries, per S1-6.
  - `loadPacks` indexes situations and adds `['situation', pack.situations ?? {}]` to the `kindOf` check.
  - Export the new names from `index.ts`.
- [ ] **Step 5: Run** `pnpm --filter @prepdesk/engine test` and `pnpm --filter @prepdesk/content-cli test` → PASS (with both CLI fixture rows).
- [ ] **Step 6: Commit** `feat(engine): situation content kind compiled to facet and index tables (D1)`.

---

### Task 2: `situation` and `facet` field sources

**Files:**

- Create: `packages/engine/src/situations.ts`
- Modify: `packages/engine/src/schema.ts`, `compile.ts`, `lint.ts`, `generate.ts` (`assemble`, `genField`, `applySafety`), `index.ts`
- Test: `packages/engine/test/situations.test.ts` (new `describe('generate situations')`, `describe('lint situation fields')`)
- Create: CLI fixtures `facet-ref/` (expects `missing-source`) and `field-cycle/` (expects `cycle`), plus their `failing` rows

**Interfaces:**

- Consumes: Task 1's `FACETS`, `Facet`, `CompiledSituation`, `CompiledEntry.ref`, `Library.situation`, the index table `<packId>.situations`, and P0's `CardField.hidden`, `applySafety` and share v2.
- Produces:
  - Source and compiled `FieldSource` gain `{ situation: { table: string; distinctFrom?: string } }` and `{ facet: { of: string; name: Facet } }`. Compile resolves `situation.table` with the generator resolver (R11 order).
  - `situations.ts`:
    - `fieldDeps(src: FieldSource): string[]` returns `[of]`, `[distinctFrom]` or `[]`.
    - `fieldOrder(gen: CompiledGenerator): string[]` implements S1-3.
    - `inDeclaredOrder<T>(gen: CompiledGenerator, rec: Record<string, T>): Record<string, T>`
  - Inside `generate.ts`, `genField(state, depth, src, rng, ctx, done: Readonly<Record<string, CardField>>)`. The new sources call two helpers from `situations.ts`, both returning the generator's `Part` shape:
    - `rollSituation` → `rollInto(table, exclude = { done[distinctFrom].sources[0] })` when that field exists and is not blocked; `sources = [indexEntryId]`; blocked when no candidate is left (S1-2);
    - `rollFacet` → blocked if `done[of]` is missing or blocked; otherwise reads `entry.ref` from `done[of].sources[0]`, rolls `lib.situation(ref).facets[name]` through `rollInto`, and prepends the index entry id to the sources (S1-1).

    Both helpers end in `selectEntry`, with no other selection path.
  - Card field key order is the declared order for `generate`, `reroll`, `cardFromShare` and `applySafety`.

- [ ] **Step 1: Write the failing tests.** Add to the fixture:

```ts
export const seedGeneratorDoc = {
  kind: 'generator', id: 's.seed', title: 'Seed',
  fields: {
    enemy: { facet: { of: 'a', name: 'enemy' } },
    b: { situation: { table: 's.situations', distinctFrom: 'a' } },
    a: { situation: { table: 's.situations' } },
    thing: { facet: { of: 'b', name: 'thing' } },
  },
  display: '{a} meets {b}',
};
```

  Tests. `lib` comes from `situationOnlyDocs + seedGeneratorDoc`, and `NONE = { lines: [], veils: [] }`.

```ts
expect(fieldOrder(lib.generator('s.seed')!)).toEqual(['a', 'enemy', 'b', 'thing']);
const card = generate(lib, 's.seed', { seed: 'TEST-0001' });
expect(Object.keys(card.fields)).toEqual(['enemy', 'b', 'a', 'thing']);
expect(card.fields.enemy!.sources[0]).toBe(card.fields.a!.sources[0]);
```

  - **Lines:** over 10,000 seeds `l${i}` with `lines: ['fire']`, neither `a` nor `b` is `'Ember toll'`. Non-vacuity: with no lines, `a === 'Ember toll'` more than 2,000 times.
  - **Veils:** over 10,000 seeds with `veils: ['religion']`, every card whose `a` or `b` is `'Bell debt'` has `flags.veiled` containing `'religion'`. Count ≥ 3,000.
  - **Distinct:** over 10,000 seeds, `a.value !== b.value`.
  - **One eligible situation:** with `lines: ['fire', 'religion']`:
    - `a.value === 'Reed vow'`;
    - `b` is `{ value: '—', blocked: true }`;
    - `thing.blocked === true`;
    - `display === BLOCKED_DISPLAY`;
    - `enemy` is not blocked.
  - **Facet follows `of`:** over 100 seeds, `ref` is the index entry `ref` for `a.sources[0]`, and `enemy.sources[1]` matches `^${ref}\.enemy#\d$`.
  - **Line round trip:** take the first seed whose `a` is `'Ember toll'`, then `x = applySafety(lib, card, { context: { safety: { lines: ['fire'], veils: [] } } })`:
    - `x.fields.a.blocked` and `x.fields.enemy.blocked` are both true;
    - `x.fields.enemy.hidden.value === card.fields.enemy.value`;
    - `x.fields.b` and `x.fields.thing` deep-equal the originals;
    - `applySafety(lib, x, { context: { safety: NONE } }).fields` deep-equals `card.fields`.
  - **Blocked at generation, filled when the line goes:** a card generated with `lines: ['fire', 'religion']`, passed to `applySafety` with `NONE`, has `b` and `thing` filled with `b !== a`, and `a` and `enemy` unchanged.
  - **Locks:** `reroll(lib, card, { locks: ['enemy'] })` keeps `enemy.value` and sets `locked: true`. On an Ember-toll card, `reroll` with `locks: ['enemy']` and `lines: ['fire']` gives `enemy` `{ blocked: true, locked: true }` (R22).
  - **Share:** `cardToShare(lib, card).exact === true`, and `cardFromShare` reproduces every field value.
  - **Runtime cycle:** take the compiled pack, overwrite the generator with `a: { situation: { table: 's.situations', distinctFrom: 'b' } }, b: { situation: { table: 's.situations', distinctFrom: 'a' } }`, then `loadPacks`. `generate` does not throw, `Object.keys(fields)` is `['a', 'b']`, and both values are non-empty.

  Lint tests. Each asserts `[code, path]` exactly:
  - `f: { facet: { of: 'x', name: 'enemy' } }` where `x` is a table field → `[['missing-source', 'd4#fields.f']]`.
  - `distinctFrom: 'zz'` → `[['missing-source', 'd4#fields.b']]`.
  - `a`/`b` distinctFrom each other → codes `['cycle']`.
  - `{ situation: { table: 's.situation.reed-vow.enemy' } }` → `[['missing-source', 'd4#fields.a']]`.
  - `name: 'villain'` → `schema`.
- [ ] **Step 2: Run** `pnpm --filter @prepdesk/engine test situations` → FAIL.
- [ ] **Step 3: Implement** per Interfaces.
  - `assemble` iterates `fieldOrder(gen)`, passes the fields built so far as `done`, then calls `inDeclaredOrder` before `finish`.
  - `applySafety` iterates in the same order. It passes the evolving `fields` as `done` when it regenerates a blocked-at-generation field.
  - Lint adds the S1-7 field rules, and adds field dependency edges `field:<genId>.<name>` to the cycle graph (or runs a separate per-generator cycle check reporting `cycle` at `<file>#fields.<name>`).
- [ ] **Step 4: Run** `pnpm --filter @prepdesk/engine test && pnpm --filter @prepdesk/content-cli test && pnpm test:coverage` → PASS, coverage ≥ 90%.
- [ ] **Step 5: Commit** `feat(engine): situation and facet field sources through selectEntry (D1)`.

---

### Task 3: Extend the I3 generation-level safety property to situations

**Files:**

- Modify: `packages/engine/test/safety.property.test.ts`

**Interfaces:**

- Consumes: Task 2's field sources, `applySafety`, `fieldOrder`, and the decisions S1-1/S1-2.
- Produces: no new API. The property now guards situations.

- [ ] **Step 1: Extend the fixture and the checks.**
  - Add three situations `p.situation.{ember-toll, reed-vow, bell-debt}`:
    - title text carries markers for the situation's safety (`~fire~Ember toll`, `~religion~Bell debt`);
    - each facet has 3 entries using `e()`, at least one marker-tagged entry per facet across the three situations, and tags drawn from `TAGS`.
  - Add generator `p.seed` with fields declared `enemy (facet of a), a, b (distinctFrom a), thing (facet of b), pressure (facet of a)` and display `'{a} meets {b}'`.
  - Every existing path also runs `p.seed`:
    - generate: 2,000;
    - reroll with random locks over `['enemy', 'thing', 'pressure', 'a', 'b']`: 1,000;
    - share: 1,000;
    - batch: `{ generatorId: 'p.seed', count: 2 }` per batch.
  - New path `applySafety`, 1,000 cards: generate under `before`, lock at random via `reroll`, call `applySafety` with `after = settings(rng, before)` and check, then `applySafety` back to `before` and assert `fields` deep-equal the pre-toggle card (Review Focus 3).
  - `checkSeed(card, safety)` is called from `checkCard` when the generator is `p.seed`:
    - if `a` and `b` are both visible, they differ (`stats.distinct++`);
    - if an unlocked facet's `of` field is blocked, the facet is blocked (`stats.facetByOf++`);
    - every visible facet's `sources[0]` starts with `p.situations#`, and for unlocked facets equals its `of` field's `sources[0]`.
  - New totals: `stats.checked === 15_000` (10,000 `p.main` + 5,000 `p.seed`) and `stats.applied === 1_000`.
  - Non-vacuity:
    - `stats.distinct > 3_000` and `stats.facetByOf > 100`;
    - per path, `reach[path].enemy`, `.thing` and `.pressure` each reach at least 3 tags;
    - `enemy` is visible in at least 50% of generate-path seed cards, which fails if topological order is removed.
- [ ] **Step 2: Run** `pnpm --filter @prepdesk/engine test safety.property` → PASS, reported counts included.
- [ ] **Step 3: Mutation check (keep the logs).** Apply each mutation in turn, run the test, confirm it goes red, revert, and save each log to the scratchpad as `mutation-<n>.log` (R32 minor: judge by the assertion message, not the exit code alone):
  1. `rollFacet` picks `table.entries[rng.int(n)]` and bypasses `selectEntry`.
  2. `rollSituation` falls back to the unfiltered table, ignoring lines, when exclusion empties the safe pool.
  3. `rollFacet` ignores a blocked `of` field.
  4. Facet sources omit the index entry id.
  5. `assemble` iterates declared order instead of `fieldOrder`.
  6. `distinctFrom` is ignored.
- [ ] **Step 4: Commit** `test(engine): I3 safety property covers situations, facets and applySafety`. List the six mutation results in the commit body.

---

### Task 4: Authoring guards (safety stems, `culture-safety` lint, blank-aware `or:`)

**Files:**

- Create: `packages/engine/src/safetyStems.ts`, `packages/engine/test/safetyStems.test.ts`
- Modify: `packages/engine/src/errors.ts`, `lint.ts`, `render.ts`, `index.ts`, `test/lint.test.ts`, `test/render.test.ts`
- Create: CLI fixture `tools/content-cli/test/fixtures/culture-safety/` (`src/culture.yaml`, `src/vocab.yaml`), plus a test like the existing weak-culture one: exactly `['culture-safety']`, path matches `src/culture.yaml`.

**Interfaces:**

- Produces:
  - `SAFETY_STEMS: Readonly<Record<string, readonly string[]>>`, keyed by every `SAFETY_VOCABULARY` tag.
  - `stemHits(text: string): string[]` returns the topics whose stems match, in vocabulary order. Each stem is a regex fragment matched case-insensitively at a word start (`\b(?:stem)`); a trailing `\b` in the stem means a whole word.
  - `ContentErrorCode` gains `'culture-safety'`. Lint reports each culture `examples[i]` at `<file>#names.examples[i]` and each `voice.tips[i]` at `<file>#voice.tips[i]`.
  - The `or` modifier fires when `text.trim() === ''` (S1-8).

- [ ] **Step 1: Write the failing tests.**

```ts
expect(stemHits('a fight over the coal fire')).toEqual(['violence', 'fire']);
expect(stemHits('jars of moths and beer')).toEqual(['insects']);
expect(stemHits('mother been warrick brackish')).toEqual([]);
for (const c of Object.values(fantasyPack.cultures)) for (const ex of c.examples) expect(stemHits(ex), ex).toEqual([]);
expect(Object.keys(SAFETY_STEMS)).toEqual([...SAFETY_VOCABULARY]);
// lint: culture with examples ['Corpsewick Vey'] and tips ['Pray before you lie.']
expect(errs.map((e) => [e.code, e.path])).toEqual([['culture-safety', 'd0#names.examples[0]'], ['culture-safety', 'd0#voice.tips[0]']]);
// render: '{ctx.front.name|or:the old guild}'
expect(render({ front: { name: '   ' } })).toBe('the old guild');
expect(render({ front: { name: '' } })).toBe('the old guild');
expect(render({ front: { name: 'Ash Court' } })).toBe('Ash Court');
```

- [ ] **Step 2: Run** `pnpm --filter @prepdesk/engine test safetyStems lint render` → FAIL.
- [ ] **Step 3: Implement** `safetyStems.ts` with these stems (the list is short on purpose: it is a backstop for review, not a classifier):

| Topic          | Stems                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| violence       | fight, brawl, stab, murder, kill, slay, slain, assault, riot, ambush, blood                                                                                     |
| gore           | `gore\b`, gory, `guts?\b`, gutted, entrail, sever, flay, maim, dismember                                                                                        |
| death          | dead, death, `die\b`, `dies\b`, `died\b`, dying, corpse, `graves?\b`, graveyard, tomb, burial, buried, funeral, coffin, ghost, undead                            |
| torture        | tortur, torment, thumbscrew                                                                                                                                     |
| sexual-content | brothel, seduc, naked, nude, sexual, courtesan, lover                                                                                                           |
| abuse          | abus, bully, bullie                                                                                                                                             |
| child-harm     | `child-?(beat\|harm)`, infantic                                                                                                                                 |
| self-harm      | self-harm, self-injur                                                                                                                                           |
| suicide        | suicid, noose, hanged                                                                                                                                           |
| addiction      | addict, drunk, opium, craving, withdrawal                                                                                                                       |
| slavery        | slave, enslav, shackle, thrall, indentur, chattel                                                                                                               |
| body-horror    | parasite, mutat, fester, pustule, flesh-                                                                                                                        |
| insects        | insect, beetle, maggot, wasp, hornet, locust, termite, cockroach, swarm, `bees?\b`, `ants?\b`, `moths?\b`, `flies\b`, `lice\b`, louse                           |
| spiders        | spider, cobweb, arachn, `webs?\b`                                                                                                                               |
| rats           | `rats?\b`, rodent, vermin, `mice\b`                                                                                                                             |
| drowning       | drown, flood, undertow, `sank\b`, `sunk\b`, sinking                                                                                                             |
| fire           | fire, flame, burn, blaze, inferno, arson, pyre, scorch, smoulder, smolder                                                                                       |
| claustrophobia | cramped, crawlspace, buried alive, walled up, airless                                                                                                           |
| religion       | shrine, temple, priest, `gods?\b`, goddess, saint, pray, monk, `nuns?\b`, abbey, abbot, chapel, church, holy, sacred, relic, `cults?\b`, blessed, heres, heretic, pilgrim, faith, altar |
| hate-bigotry   | bigot, pogrom, slur                                                                                                                                             |
| animal-harm    | slaughter, cockfight, dogfight, bear-bait, poach, `cull\b`, skinned                                                                                             |
| pregnancy      | pregnan, midwife, childbirth, with child, unborn                                                                                                                |
| mental-illness | madness, `mad\b`, insane, insanity, lunatic, asylum, delusion, deranged                                                                                         |
| police         | constable, sheriff, bailiff, watchm, sergeant, `guards?\b`, the watch\b, jailer, gaoler                                                                         |
| war            | `wars?\b`, warfare, warlord, soldier, army, armies, siege, battle, deserter, desertion, mercenar, regiment, veteran                                             |

  Lint runs `stemHits` over each culture's `examples` and `voice.tips`. If a current culture example or tip trips the lint, rewrite it in this task, so `pnpm content:lint` stays clean.
- [ ] **Step 4: Run** `pnpm --filter @prepdesk/engine test && pnpm --filter @prepdesk/content-cli test && pnpm content:lint && pnpm test:coverage` → PASS.
- [ ] **Step 5: Commit** `feat(engine): culture-safety lint, safety stems and blank-aware or: (D11)`.

---

### Task 5: Content gates harness and writing rules

**Files:**

- Create: `packages/engine/test/fixtures/content-spec.ts`, `test/content.quality.test.ts`, `test/content.property.test.ts`, `test/tools/audit-list.ts`
- Modify: `packages/engine/test/packs.test.ts`, `packages/content-fantasy/CONTRIBUTING.md`, and NPC/oracle entries only where a gate fails

**Interfaces:**

- Consumes: `stemHits` (Task 4), the starter-pack `lib`, and the strict-lines fixture.
- Produces (`content-spec.ts`). Every later content task edits these rows:

```ts
export type TableKind = 'line' | 'word' | 'pattern' | 'fixed';
export type TableSpec = {
  family: string; target: number; full: boolean; kind: TableKind;
  stub?: number;          // threshold while !full (default Math.min(8, target))
  pocket?: true;          // Pocket-feeding: ≥ 12 eligible under STRICT_LINES once full
  terrain?: true;         // each TERRAIN tag on ≥ 3 entries once full
  caps?: true;            // word tables in Title Case (default lower case)
  end?: '?';              // every entry ends with '?'
};
export const TABLE_SPEC: Record<string, TableSpec>;
export const threshold = (s: TableSpec) => (s.full ? s.target : (s.stub ?? Math.min(8, s.target)));
export const GENERATORS: string[];   // every generator under test ('fantasy.npc' now)
export const FAMILY_TAG: Record<string, string>; // family → table tag ('npc' → 'npc', 'place' → 'place', …)
export const STRICT_LINES = ['violence', 'death', 'fire', 'drowning', 'religion', 'spiders', 'insects', 'rats', 'war'];
export const TERRAIN = ['urban', 'rural', 'coastal', 'wilderness', 'river', 'forest', 'mountain', 'underground', 'ruin', 'road'];
export const CTX_KEYS = ['settlement.name', 'front.name', 'place.name', 'mention.name', 'pc.name', 'pc.want', 'truth.text'];
export const FREE_TEXT_KEYS = ['pc.want', 'truth.text'];
export const SITUATIONS = { target: 20, stub: 4, facetTarget: 4, facetStub: 3, full: false };
export const CULTURES_SPEC = { examples: 16, tips: 4, full: false };
export const DECK_SPEC = { id: 'core.gm-moves', target: 24, stub: 12, full: false };
export const AUDIT_EXCEPTIONS: Array<{ table: string; text: string; topic: string; reason: string }>;
```

  Initial rows:
  - the five `fantasy.npc.*` tables: `family: 'npc'`, `target: 20`, `full: true`, `kind: 'line'`, `pocket: true`;
  - `fantasy.meaning.action` and `fantasy.meaning.theme`: `family: 'oracle'`, `target: 50`, `stub: 30`, `full: false`, `kind: 'word'`.

- [ ] **Step 1: Write the gate tests** (all read `TABLE_SPEC` and the compiled packs).
  - `packs.test.ts` (spec §4.6.4):
    - every `TABLE_SPEC` id exists, with `entries.length >= threshold(spec)` (`fixed` kind: exactly `target`);
    - safety-tagged entries ≤ 30% for `line`/`word` tables;
    - under `STRICT_LINES`, every `line`/`word` table with ≥ 8 entries loses ≤ 40%, and `pocket && full` tables keep ≥ 12 eligible;
    - every situation facet has ≤ 1 strict-lined entry; the index keeps ≥ `full ? 10 : 2` eligible entries; there are ≥ `full ? 20 : 4` situations, each facet with ≥ `full ? 4 : 3` entries;
    - **1,000-generation sweep:** each id in `GENERATORS` generates 1,000 times (`seed: \`sweep-${i}\``, empty context) with no throw, `console.warn` never called (spy; prod rendering turns a missing ref into a warn, not `[missing`), no field value `''` unless blocked, and no field containing `[missing`;
    - **snapshots:** for each id in `GENERATORS` except `fantasy.npc`, `generate(lib, id, { seed: 'TEST-0001' })`'s `{ display, fields }` matches the file snapshot `./fixtures/__snapshots__/${id}.json`;
    - the deck has ≥ `threshold(DECK_SPEC)` cards (replaces `toHaveLength(12)`), and each meaning table has ≥ its threshold (replaces `toHaveLength(30)`).
  - `content.quality.test.ts` runs over every `TABLE_SPEC` table and every situation's facet tables:
    - no `!` in any entry;
    - `line` entries: ≤ 110 characters of source text, start lower case or with a slot, do not end with `.` or `,` (or end with `?` when `end: '?'`), and no two entries in a table share their first 3 words after lowercasing and stripping slots. `rumor.text` and `secret.text` are checked as one pool;
    - `word` entries: ≤ 20 characters, ≤ 2 words, unique ignoring case, matching `/^[a-z][a-z' -]*$/` (or Title Case when `caps`). Oracle words keep the existing `/^[a-z]+$/`;
    - `pattern` entries each contain at least 1 slot;
    - **articles:** every table reached through a slot with the `a` modifier (found by walking generator displays and table ASTs, following field refs to their field's table) has no entry whose first word is `a`, `an`, `the`, `one`, `hour`, `honest`, `honour`, `heir` or starts with `uni`/`eu`;
    - **ctx:** every `ctx` slot has an `or:` modifier and a path in `CTX_KEYS`; a `FREE_TEXT_KEYS` slot is the last element of its AST;
    - **safety audit:** for every entry, `stemHits(text)` topics not in `entry.safety` fail, unless `{ table, text, topic }` is in `AUDIT_EXCEPTIONS` (each with a `reason`);
    - every table whose family has a `FAMILY_TAG` carries that tag in its table `tags`; `terrain && full` tables carry each `TERRAIN` tag on ≥ 3 entries; every vocabulary tag is used by at least one table, entry or situation;
    - situations: titles are 2–3 words and unique; `tags[0] === 'situation'`; summaries are ≤ 120 characters and end with `.`;
    - cultures: when `CULTURES_SPEC.full`, each culture has ≥ 16 examples and exactly 4 tips; otherwise ≥ 8 and 3.
  - `content.property.test.ts` over `GENERATORS`:
    - **Determinism:** 50 seeds per generator; two calls with the same seed and context give deep-equal `fields` and `display` (never compare `card.id`).
    - **Lines, 10,000 generations:** `i` → generator `GENERATORS[i % n]`, with safety from `createRng('content', i)` (each vocabulary tag lined at p = 0.2, veiled at p = 0.2).
      - Every visible field's source entries carry no lined tag, and their veiled tags are all in `card.flags.veiled`.
      - Every fifth card is rerolled with random locks under new random lines and checked again.
      - Non-vacuity: the same seed generated with no lines would have shown a lined source in ≥ 500 of the 10,000 cases.
    - **All 25 lines:** 50 seeds per generator; no throw, and every field is either blocked or clean.
    - **Display sanity** (every non-blocked display): non-empty, ≤ 160 characters, first character an uppercase letter, digit or quote. It contains none of `{`, `}`, `[missing`, `undefined`, `null`, `'  '`, `' ,'`, `' .'`, `'..'`, and it does not match `/\b(a|an) (a|an|the)\b/i`.
    - **DM-shaped context:** 1,000 generations with `{ settlement: { name: 'Gallowmere' }, front: { name: 'the Ash Court' }, mention: { name: 'Odrin Vey' }, pc: { name: 'Mara', want: 'to find her brother.' }, truth: { text: 'The mayor poisoned the well.' } }`. Displays and field values pass sanity, except that one final `.` is allowed, and match no `/\.\s+[a-z]/`.
    - **Blank context:** the same, with every key `'   '`.
  - `tools/audit-list.ts`: `tsx packages/engine/test/tools/audit-list.ts <tableId-or-prefix>...` prints a Markdown sheet with one row per entry: id, text, safety, stem hits, untagged hits.
- [ ] **Step 2: Run** `pnpm --filter @prepdesk/engine test packs content` → any failure must be real: an existing NPC or oracle entry that breaks a gate. Rewrite those entries, keeping their safety tags right, or add an `AUDIT_EXCEPTIONS` row with a reason. List each change in the commit body. If an entry changes, update `fantasy-npc.marsh.json` with `-u` and review the diff.
- [ ] **Step 3: Update `CONTRIBUTING.md`.** Add:
  - the §4.5 rules: the slot-grammar title stem, ≤ 30% tagged, no duplicates in spirit across `rumor.text`/`secret.text`, and the D11 names and voice note with the `culture-safety` lint;
  - a "Situations" section: six facets with what each holds, ≥ 4 entries, title rule, originality check;
  - a "Quality gates" section listing every automated check above and `pnpm --filter @prepdesk/engine test packs content`;
  - the Content Task Protocol audit procedure.

  Culture counts stay as they are until Task 20.
- [ ] **Step 4: Run** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm content:lint` → PASS.
- [ ] **Step 5: Commit** `test(content): table-driven content gates, safety audit and content property tests`.

---

### Task 6: Wire place, settlement, tavern and shop generators (8-entry tables)

**Files:**

- Create: `packages/content-fantasy/src/generators/{place,settlement,tavern,shop}.yaml`, and the tables in `src/tables/{place,settlement,tavern,shop}/*.yaml` listed in Tasks 8–12
- Modify: `src/vocabulary.yaml` (add `place, settlement, tavern, shop, river, forest, mountain, underground, ruin, road`), `packages/engine/test/fixtures/content-spec.ts`, and the new snapshot files

**Interfaces:**

- Consumes: Task 5's `TABLE_SPEC`, `GENERATORS` and gates.
- Produces: generators `fantasy.place`, `fantasy.settlement`, `fantasy.tavern` and `fantasy.shop`, with fields and display exactly as in spec §4.3. Table ids are as in §4.4, each with `full: false`.

- [ ] **Step 1: Add the rows (failing test).** Add the four generator ids to `GENERATORS`, and add `TABLE_SPEC` rows for:
  - `fantasy.place.{word-a (word, caps), word-b (word), name (pattern, 10), kind (line, pocket, terrain), sight, sound, smell (line, pocket, terrain, 40), happening (line, pocket, terrain)}`;
  - `fantasy.settlement.{name (pattern, 10), size (fixed, 6), known-for, trouble (30), power (24)}`;
  - `fantasy.tavern.{name (pattern, 8), adj, noun (word, caps, 30), keeper-way (24, pocket), menu (30, pocket), regular (30, pocket)}`;
  - `fantasy.shop.{name (pattern, 8), noun (word, caps, 20), kind (24, pocket), ware (60, pocket), oddity (24, pocket), haggle (20, pocket)}`.

  Set `FAMILY_TAG` for the four families. Run `pnpm --filter @prepdesk/engine test packs content` → FAIL (the tables don't exist).
- [ ] **Step 2: Write the generators and tables.**
  - Every table gets 8 real entries (pattern tables 8; `settlement.size` all 6, weighted toward village), written to the Task 8–12 rules. They are the first entries of the final tables, not placeholders.
  - Every table `title` states its stem, and every table's `tags` include its family tag.
  - Displays: `fantasy.tavern` `'{name}, kept by {keeper}'`; `fantasy.place`/`fantasy.shop` `'{name}, {kind|a}'`; `fantasy.settlement` `'{name}, {size|a}'`.
- [ ] **Step 3: Run** `pnpm content:lint` (no output) and `pnpm --filter @prepdesk/engine test packs content -u`. Check that only the four new snapshot files were written, and read them: each display must read sensibly. Then rerun without `-u` → PASS.
- [ ] **Step 4: Light review.** Read all entries against the CTP rubric (below) and fix weak ones. A full review happens in S1b.
- [ ] **Step 5: Commit** `feat(content): place, settlement, tavern and shop generators with starter tables`.

---

### Task 7: Wire the story, loot, encounter, seed and prep generators (8-entry tables, 4 situations)

**Files:**

- Create: `src/generators/{rumor,secret,clue,complication,trinket,treasure,encounter,seed,prep-spotlight,prep-pressure}.yaml`; tables under `src/tables/{rumor,secret,clue,complication,trinket,treasure,encounter,prep}/`; `src/situations/<slug>.yaml` × 4
- Modify: `src/vocabulary.yaml` (add `rumor, secret, clue, complication, loot, encounter, situation`), `content-spec.ts`, and the snapshots

**Interfaces:**

- Consumes: Tasks 2 and 5.
- Produces:
  - Generators exactly as in spec §4.3:
    - `fantasy.seed` fields `a`, `b` (`distinctFrom: a`), then `enemy` (of a), `friend` (of b), `complication` (of b), `thing` (of a), `place` (of b), `pressure` (of a), with display `'{a} meets {b}'`;
    - `fantasy.prep.spotlight` (`hook` field → `fantasy.prep.spotlight-hook`);
    - `fantasy.prep.pressure` (`rumor` field → `fantasy.prep.pressure-rumor`, `turn` field → `fantasy.complication.twist`).
  - Tables `fantasy.prep.return` and `fantasy.prep.villain-move`, which the app rolls with `rollTable` (S4).
  - The index table `fantasy.situations`.

- [ ] **Step 1: Add the rows (failing test).** Add the ten generator ids to `GENERATORS`, and add `TABLE_SPEC` rows (`full: false`) for:
  - `fantasy.rumor.{text (40, pocket), truth (fixed, 3), source (24, pocket)}` and `fantasy.secret.text (40)`;
  - `fantasy.clue.{delivery (24), trace (40), where (24)}`;
  - `fantasy.complication.{trouble (40, pocket), twist (30, pocket)}`;
  - `fantasy.trinket.{item (50, pocket), detail (30, pocket)}`;
  - `fantasy.treasure.{item (40, pocket), worth (12), hook (24, pocket)}`;
  - `fantasy.encounter.{question (30, end '?'), opposition (30), goal (24), terrain (30, terrain), turn (24), fail (24)}`;
  - `fantasy.prep.{spotlight-hook (24), return (16), villain-move (30), pressure-rumor (24)}`.

  Set `FAMILY_TAG` (trinket and treasure → `loot`; prep has no family tag). Run the gates → FAIL.
- [ ] **Step 2: Write the generators, tables and four situations.** The tables get 8 real entries each, except `rumor.truth`, which gets its 3 exact entries: "true" (weight 2), "half true: the details are wrong" (weight 2), "false, but someone wants it believed" (weight 1). `treasure.worth` gets 8 of its 12. The four situations each have 3 entries per facet and follow the Task 17 rules. `fantasy.trinket.item` includes at least 2 entries tagged `spiders` (J3 needs a known spider-tagged trinket).
- [ ] **Step 3: Run** `pnpm content:lint` and the gates with `-u`. Only the ten new snapshot files may be written; read them. Rerun → PASS.
- [ ] **Step 4: Light review** (CTP rubric). Then run the R29 clean clone: `git clone` the branch into the scratchpad, `pnpm install --frozen-lockfile`, then `lint → typecheck → test → test:coverage → content:lint → build`, all green. This is the **S1a checkpoint**: the controller pushes and the real CI run must be green before Task 8 starts.
- [ ] **Step 5: Commit** `feat(content): story, loot, encounter, seed and prep generators with starter tables`.

---

## S1b: full content

### Content Task Protocol (CTP), shared by Tasks 8–20

Every S1b task follows these steps in order. The dispatch to each content task's implementer includes this section.

1. **Red.** Set `full: true` on the task's `TABLE_SPEC` rows, or on its `SITUATIONS`, `CULTURES_SPEC` or `DECK_SPEC` counter. Run `pnpm --filter @prepdesk/engine test packs content`, expect FAIL on counts, and save the output as red evidence.
2. **Write.** Extend the tables, keeping the good S1a entries, to at least the target counts. Counts are minimums: cut weak entries rather than pad.
3. **Lint.** `pnpm content:lint` prints nothing.
4. **Green.** Run the gates with `-u` limited to this family's generators (`-t "<generatorId>"`). The snapshot diff must stay inside the generators that read this task's tables. Rerun without `-u` → PASS.
5. **Safety-tag audit.**
   - Run `tsx packages/engine/test/tools/audit-list.ts <task tables>` into the scratchpad.
   - Check every entry against all 25 topics, not just its stem hits. Tag anything touching a topic, including mild or indirect mentions ("when unsure, tag it"), while keeping each table at ≤ 30% tagged by rewriting rather than dropping tags.
   - An `AUDIT_EXCEPTIONS` row is allowed only for a true false positive ("fireplace" in a cosy hearth sense is **not** one: tag it or reword it), with its reason.
6. **Originality.**
   - Write every entry fresh.
   - For each table, search the 5 most distinctive entries verbatim (quoted web search) and confirm there is no published match.
   - Avoid proper nouns from published settings, real-world religions, peoples and places, and system terms such as gp, hit points or DCs.
7. **Quality review.** A fresh reviewer reads **every** entry, reading each one aloud after its table's title stem, and scores it against the rubric:
   - **Specific:** a concrete detail the DM can perform or point at.
   - **Playable:** it offers a choice, a hook or a complication.
   - **Fits the slot** grammatically.
   - **One breath.**
   - **Original.**
   - **Distinct in spirit** within the table and across its family.
   - **Safety tags accurate:** each tag justified, each untagged entry clear of all 25 topics.
   - **Tone:** grounded and a little wry, never grimdark for its own sake.
   - **System-neutral.**

   The reviewer returns the entries to cut, rewrite or retag, and every finding is fixed before the next step. The verdict is recorded in the ledger.
8. **Commit** with explicit paths. The body gives the per-table counts and the number of tagged entries per table.

Shared style: entries are fragments that finish the title stem. They start lower case, have no trailing period and no exclamation mark, use no "you" (except encounter `fail` and `turn`, where it reads naturally), and put free-text context only at the end (S1-9).

### Task 8: Place senses

**Files:** `packages/content-fantasy/src/tables/place/{sight,sound,smell}.yaml`, `content-spec.ts` rows, snapshots for `fantasy.place`, `fantasy.settlement` and `fantasy.tavern`.
**Interfaces:** Consumes the Task 5 gates and the Task 6 tables. Produces the three tables at 40 entries each (`pocket`, `terrain`).

- [ ] **Step 1: CTP 1–4.**
  - **Stems:** `sight` "The first thing you notice is …", `sound` "Over everything you hear …", `smell` "The air smells of …".
  - **Rule:** each `TERRAIN` tag appears on ≥ 3 entries per table, and indoor-neutral entries carry no terrain tag.
  - **Samples:**
    - sight: "laundry strung between the gables like signal flags", "a cart propped level on a stack of bricks", "moss growing in the letters of an old boundary stone" (`road`);
    - sound: "a mooring rope creaking against a wet post" (`river`), "someone practising the same four notes on a flute";
    - smell: "tar, rope and low tide" (`coastal`), "hot bread and horse".
- [ ] **Step 2: CTP 5–7** (audit, originality, quality review).
- [ ] **Step 3: CTP 8:** commit `content(fantasy): place senses to 40 each`.

### Task 9: Place names, kinds and happenings

**Files:** `src/tables/place/{word-a,word-b,name,kind,happening}.yaml`, rows, snapshots.
**Interfaces:** Produces `word-a` 30 (Title Case), `word-b` 30, `name` 10 patterns, `kind` 30 (article rule, `terrain`), `happening` 30 (`terrain`).

- [ ] **Step 1: CTP 1–4.**
  - `name` patterns combine the word tables, for example `{word-a}{word-b}` → "Hollinford" and `{word-a} {word-b|cap}` → "Cold Mere". Every combination must be pronounceable: reviewers roll 30 names.
  - **Stems:** kind "A …" (no leading article; the display adds it); happening "Right now, …".
  - **Samples:**
    - word-a: "Hollin", "Wether", "Cold";
    - word-b: "ford", "combe", "hythe";
    - kind: "half-built bridge" (`river`), "toll gate" (`road`), "salt-pan" (`coastal`);
    - happening: "two carters are trying to pass on a lane built for one" (`road`), "the ferry is on the far bank and the ferryman is asleep" (`river`).
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): place names, kinds and happenings`.

### Task 10: Settlement

**Files:** `src/tables/settlement/{name,size,known-for,trouble,power}.yaml`, rows, snapshot `fantasy.settlement`.
**Interfaces:** Produces `name` 10 patterns over the place word tables, `size` 6 (`fixed`), `known-for` 30, `trouble` 30, `power` 24.

- [ ] **Step 1: CTP 1–4.**
  - `size` (article rule) is exactly: hamlet (weight 3), village (5), market town (3), walled town (2), river port (1), city (1).
  - **Stems:** known-for "Known for …", trouble "Lately, …", power "Who really runs it: …".
  - **Samples:**
    - name: "{fantasy.place.word-a} Market";
    - known-for: "cheese that travels badly and sells anyway", "the only honest weigh-house for three valleys";
    - trouble: "two families both claim the mill under the same old charter";
    - power: "the ferry guild, who decide which news crosses the river", "a widow who holds every mortgage in town".
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): settlement tables to count`.

### Task 11: Tavern

**Files:** `src/tables/tavern/{name,adj,noun,keeper-way,menu,regular}.yaml`, rows, snapshot `fantasy.tavern`.
**Interfaces:** Produces `name` 8 patterns, `adj` 30 and `noun` 30 (Title Case), `keeper-way` 24, `menu` 30, `regular` 30.

- [ ] **Step 1: CTP 1–4.**
  - **Pattern samples:** "The {adj} {noun}", "The {noun} and {noun}", "{name:family}'s {noun}".
  - **Stems:** keeper-way "The keeper …", menu "Tonight's pot: …", regular "In the corner: …".
  - **Samples:**
    - adj: "Crooked", "Patient", "Brass";
    - noun: "Heron", "Kettle";
    - keeper-way: "polishes the same cup whenever a question gets awkward";
    - menu: "eel pie with too much pepper";
    - regular: "two sisters who only speak to each other through the cat".
  - Gambling is untagged, but drinking to excess is `addiction`.
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): tavern tables to count`.

### Task 12: Shop

**Files:** `src/tables/shop/{name,noun,kind,ware,oddity,haggle}.yaml`, rows, snapshot `fantasy.shop`.
**Interfaces:** Produces `name` 8 patterns, `noun` 20 (Title Case), `kind` 24 (article rule), `ware` 60 (picked 3 at a time and joined with "; "), `oddity` 24, `haggle` 20.

- [ ] **Step 1: CTP 1–4.**
  - **Pattern samples:** "{name:family}'s {noun}", "The {fantasy.tavern.adj} {noun}".
  - **Stems:** kind "A …", ware "On the shelf: …", oddity "The odd thing here: …", haggle "If you haggle, …".
  - **Samples:**
    - kind: "chandler", "map-seller's stall";
    - ware: "boots resoled with old saddle leather", "a tin whistle only dogs seem to hear";
    - oddity: "every price tag is written in a different hand";
    - haggle: "the keeper knocks the price down for a good story".
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): shop tables to count`.

### Task 13: Rumor and secret

**Files:** `src/tables/rumor/{text,truth,source}.yaml`, `src/tables/secret/text.yaml`, rows, snapshots for `fantasy.rumor`, `fantasy.secret` and `fantasy.tavern` (its rumor field).
**Interfaces:** Produces `rumor.text` 40, `rumor.truth` 3 (exact, from Task 7), `rumor.source` 24, `secret.text` 40.

- [ ] **Step 1: CTP 1–4.**
  - `rumor.text` may read `ctx.front.name`, `ctx.settlement.name` and `ctx.mention.name` with `or:` fallbacks, in at most about 1 entry in 3.
  - No rumor and secret may lead to the same scene: the gate checks first words, and the reviewer checks spirit.
  - **Stems:** rumor "People say that …", source "Heard from …", secret "Secretly, …".
  - **Samples:**
    - rumor: "the miller's new wheel turns even when the river is low", "{ctx.front.name|or:the old guild} pays twice the going rate for maps of the hills";
    - source: "a carter who wants a free drink for it";
    - secret: "the toll bridge was never finished, and the far half is painted canvas", "the beloved old mayor died a month ago and his clerk signs for him" (`death`).
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): rumors and secrets to count`.

### Task 14: Clue and complication

**Files:** `src/tables/clue/{delivery,trace,where}.yaml`, `src/tables/complication/{trouble,twist}.yaml`, rows, snapshots for `fantasy.clue`, `fantasy.complication` and `fantasy.prep.pressure`.
**Interfaces:** Produces `delivery` 24, `trace` 40, `where` 24, `trouble` 40, `twist` 30. Display `'{delivery|cap}: {trace}'`. No `ctx.truth.text` (S1-9).

- [ ] **Step 1: CTP 1–4.**
  - **Stems:** delivery "The clue comes as …", trace "It shows …", where "Found …", trouble "Just then, …", twist "Twist: …".
  - **Samples:**
    - delivery: "a receipt in the wrong pocket";
    - trace: "who was in the room after midnight", "that the letter was written left-handed";
    - where: "under the third stair, which creaks differently";
    - trouble: "someone they owe money to walks in";
    - twist: "the stolen thing was stolen first from someone worse".
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): clues and complications to count`.

### Task 15: Loot

**Files:** `src/tables/trinket/{item,detail}.yaml`, `src/tables/treasure/{item,worth,hook}.yaml`, rows, snapshots for `fantasy.trinket` and `fantasy.treasure`.
**Interfaces:** Produces `trinket.item` 50 (keeping ≥ 2 `spiders` entries), `trinket.detail` 30, `treasure.item` 40, `treasure.worth` 12 (system-neutral), `treasure.hook` 24.

- [ ] **Step 1: CTP 1–4.**
  - **Stems:** item "a …" (entries carry their own article; the display caps it), detail "Look closer: …", worth "It is …", hook "But …".
  - **Samples:**
    - trinket.item: "a brass thimble engraved with a stranger's initials", "a wooden spider whose legs fold flat" (`spiders`);
    - detail: "it is warm when nobody is holding it";
    - treasure.item: "a bolt of sea-green silk, still sealed in waxed cloth";
    - worth: "worth a month's wages", "worth a fortune, if you can prove it's real";
    - hook: "its last owner wants it back and knows who has it".
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): trinkets and treasure to count`.

### Task 16: Encounter

**Files:** `src/tables/encounter/{question,opposition,goal,terrain,turn,fail}.yaml`, rows, snapshot `fantasy.encounter`.
**Interfaces:** Produces `question` 30 (ends with `?`), `opposition` 30, `goal` 24, `terrain` 30 (`terrain`), `turn` 24, `fail` 24 (fail forward: the story moves on at a cost, never "nothing happens").

- [ ] **Step 1: CTP 1–4.**
  - **Stems:** question "Can they …?" (lower-case start; the display caps it), opposition "Standing in the way: …", goal "The other side wants …", terrain "Where: …", turn "Halfway through, …", fail "If they fail, …".
  - **Samples:**
    - question: "can they get the ferry across before the rope gives?";
    - opposition: "a toll-keeper with a ledger and no imagination";
    - goal: "to be seen winning, not to win";
    - terrain: "a crowded fish market at dawn" (`urban`, `coastal`);
    - turn: "an onlooker picks a side";
    - fail: "they get through, and owe the wrong person a favour".
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): encounter tables to count`.

### Task 17: Situations 1–10

**Files:** `src/situations/<slug>.yaml` (10, including the 4 from Task 7 brought to 4 entries per facet), snapshot `fantasy.seed`.
**Interfaces:** Produces 10 situations, each with 6 facets of 4 entries. `SITUATIONS.full` stays false until Task 18.

- [ ] **Step 1: CTP 1–4.** Raise `SITUATIONS.facetStub` to 4 for this step's red run.
  - **Facet voice:** `enemy` and `friend` are a person or group plus what they want; `complication` is the knot that makes acting costly; `thing` is an object someone wants; `place` is a location with a reason to be there; `pressure` says what happens if nobody acts, with a when.
  - **Titles:** 2–3 words, our own. Spec samples: "Salt tithe", "Borrowed saint" (`religion`), "Drowned bell-tower" (`drowning`), "Debt of oars", "Wolf-tax". New: "Mortgaged bridge", "Two-mayor town", "Stolen weather".
  - **Sample facet lines** ("Mortgaged bridge"):
    - enemy: "a moneylender who will close the bridge the day the note falls due";
    - friend: "the bridge-warden's apprentice, who has copied every payment";
    - pressure: "at the spring fair the note falls due and the gates shut".
  - Title-level safety stays rare: ≥ 10 of 20 must survive strict lines.
- [ ] **Step 2: CTP 5–7.** Originality also covers every title, checked against the published tag lists of Worlds Without Number, Stars Without Number and Cities Without Number. Any match or near match (plural, synonym swap) is renamed. Never commit those lists.
- [ ] **Step 3: CTP 8:** commit `content(fantasy): situations 1-10 (tag pairs, D2)`.

### Task 18: Situations 11–20

**Files:** 10 more `src/situations/<slug>.yaml`, `content-spec.ts` (`SITUATIONS.full = true`), snapshot `fantasy.seed`.
**Interfaces:** Produces 20 situations in total (190 distinct pairs).

- [ ] **Step 1: CTP 1–4.** Same rules as Task 17. Spread situation `tags` across `TERRAIN` and the existing theme tags (`trade`, `debt`, `faith`, `crime`, `noble`, `magic`, `family`), so no single tag holds more than 6 situations.
- [ ] **Step 2: CTP 5–7.** The reviewer reads all 20 situations together for distinctness, and the originality title check runs again across all 20.
- [ ] **Step 3: CTP 8:** commit `content(fantasy): situations 11-20`.

### Task 19: Prep tables and oracle meaning words

**Files:** `src/tables/prep/{spotlight-hook,return,villain-move,pressure-rumor}.yaml`, `src/oracle/meaning-{action,theme}.yaml`, rows, snapshots for `fantasy.prep.spotlight` and `fantasy.prep.pressure`.
**Interfaces:** Produces `spotlight-hook` 24, `return` 16, `villain-move` 30, `pressure-rumor` 24, and 50 meaning words per table. The `packs.test` single-word assertion stays.

- [ ] **Step 1: CTP 1–4.**
  - **Context use:** `spotlight-hook` reads `ctx.pc.name` and, at the end only, `ctx.pc.want`. `return` reads `ctx.mention.name`. `villain-move` and `pressure-rumor` read `ctx.front.name`, `ctx.mention.name` and `ctx.settlement.name`. All carry `or:` fallbacks.
  - **Stems:** spotlight "Spotlight: …", return "Comes back: …", villain-move "The front's next move: …", pressure-rumor "People are saying …".
  - **Samples:**
    - spotlight: "someone from {ctx.pc.name|or:a hero}'s past turns up needing a favour only they can give";
    - return: "{ctx.mention.name|or:an old acquaintance} turns up with news nobody wanted";
    - villain-move: "buys up the debts of someone the party protects";
    - pressure-rumor: "{ctx.front.name|or:someone powerful} is quietly hiring in {ctx.settlement.name|or:town}".
  - **Oracle:** add 20 words per table. Audit and tag **all 50 + 50** (for example "faith" is `religion`), because J3 needs lined meaning words to disappear. The selection is ours, not a published meaning list.
- [ ] **Step 2: CTP 5–7.**
- [ ] **Step 3: CTP 8:** commit `content(fantasy): prep tables and oracle words to count`.

### Task 20: Moves deck and cultures (D41)

**Files:** `packages/content-core/src/moves.yaml`, `packages/content-fantasy/src/cultures/{marsh,highland,imperial}.yaml`, `CONTRIBUTING.md` (Cultures: "16 curated examples, 4 voice tips"), `content-spec.ts` (`DECK_SPEC.full`, `CULTURES_SPEC.full`), snapshot `fantasy-npc.marsh.json`.
**Interfaces:** Consumes P0 deck `safety`. Produces 24 moves, each audited for `safety`, with ≥ 17 eligible under strict lines, plus 3 cultures with 16 examples and 4 tips each.

- [ ] **Step 1: CTP 1.**
  - Extend `packs.test`: every move has ≤ 8 words, a prompt ending in `?` and ≤ 30% `safety`-tagged; under `STRICT_LINES`, ≥ 17 cards stay drawable.
  - Every culture example matches the culture's `banned` rules, has no `stemHits`, and is not shared with another culture.
  - Run → FAIL.
- [ ] **Step 2: CTP 2–4.**
  - **Moves:** add 12 to the existing 12, and audit all 24. Samples: "Let the clock run out on something small", "Give the opposition a reason to bargain", "Put two loyalties at odds", "Show the cost of an earlier win". Originality: no move matches or closely paraphrases any published GM move list (Dungeon World, Apocalypse World and their derivatives).
  - **Cultures:** reach 16 curated examples each in the culture's sound, and a 4th voice tip. Samples: marsh "Give directions by landmarks that move: \"left at the heron, if it's there.\""; highland "Count favours out loud, like debts at market." `culture-safety` must pass.
- [ ] **Step 3: CTP 5–7.**
- [ ] **Step 4: CTP 8:** commit `content: 24 safety-tagged GM moves; cultures at 16 examples and 4 tips (D41)`.

---

### Task 21: Generator picker on `/forge-preview`, real-browser smoke and S1 acceptance

**Files:**

- Modify: `apps/web/src/dev/ForgePreview.tsx`, `apps/web/src/dev/forge.css`, `apps/web/src/dev/__tests__/ForgePreview.test.tsx`, `apps/web/e2e/targets.spec.ts` (new floor counts)
- Create: `apps/web/e2e/generators.spec.ts`
- Modify: `packages/engine/bench/generate.bench.ts`, `packages/content-{fantasy,core}/package.json` (`prepdesk.version` → `0.2.0`, S1-10), `content-spec.ts` (a test that every row is `full`), and any tests pinning pack version `0.1.0`

**Interfaces:**

- Consumes: every generator and Task 4's blank-aware context; `generate`, `reroll` and `applySafety`; the kit (`Button`, `Card`, `Field`, `IconButton`, `Stamp`, `SectionLabel`).
- Produces: a new "Roll anything" section on the dev page:
  - a labelled native `<select>` ("Generator") listing all 15 `fantasy.*` generators by `title`, default `fantasy.place`;
  - **Roll** and **Reroll** keys;
  - the card: display `data-testid="gen-display"`, rows `gen-field-value-<name>` with lock toggles and the BLOCKED, LOOSENED and VEILED stamps (reuse the NPC card renderer, generalised to any card);
  - the seed in mono.

  Lines and veils come from the page's existing safety section. Toggling one calls `applySafety`, so unrelated fields never reshuffle. The NPC section and its labels stay unchanged, so the existing e2e keeps passing. `/forge-preview` stays dev-only (D27). Page pattern: none (dev harness), as today.

- [ ] **Step 1: Write the failing tests.**
  - `content-spec`: `Object.values(TABLE_SPEC).every((s) => s.full)`, plus `SITUATIONS.full`, `CULTURES_SPEC.full` and `DECK_SPEC.full`.
  - Component, with the mocked seed counter:
    - the select has 15 options;
    - choosing "Tavern" and pressing Roll shows a `gen-display` equal to `generate(lib, 'fantasy.tavern', { seed: seedN(k), context }).display`;
    - locking `keeper` then pressing Reroll keeps its value;
    - checking a line calls `applySafety` (spy) and leaves every field that is not blocked unchanged.
  - e2e `generators.spec.ts` (every project), for each of the 14 new ids:
    - select it, press Roll;
    - `gen-display` is non-empty, contains no `{`, `[missing` or `undefined`, and is not "nothing fits your safety settings";
    - every `gen-field-value-*` is non-empty.

    Then axe (wcag2a and wcag2aa) has no serious or critical violations after a roll, in light and dark, and the page has no horizontal overflow.
- [ ] **Step 2: Run** `pnpm --filter @prepdesk/web test ForgePreview` and `pnpm e2e --trace off` → FAIL.
- [ ] **Step 3: Implement.**
  - Read `.ux-profile.md` and the `viewports` and `forms` skills first.
  - Keys are R31 raised keys (kit `Button`), and the select is ≥ 44 px tall with a visible label and the pencil focus ring, styled with tokens only.
  - Fonts follow R4 (existing tokens).
  - Bump both packs to `0.2.0`.
  - Add a bench case "Pocket batch (46 results)": 6 `fantasy.npc`, 6 names for each of 3 cultures, 1 tavern, 1 shop, 2 place, 6 rumor, 3 treasure, 3 trinket, 6 complication.
- [ ] **Step 4: Run** `pnpm --filter @prepdesk/web test`, then `pnpm e2e --trace off`, which includes `generators.spec` and `targets.spec` with new floors measured from a green run. Then run `ux-audit` on `/forge-preview` and check `viewports` at 375 and 1280. Fix any findings.
- [ ] **Step 5: Real-browser smoke for the owner.**
  - Run the dev server (`run` skill), open `/forge-preview` at 1194×834 and 390×844, and roll every generator 3 times.
  - Save screenshots to the scratchpad and list three example displays per generator in the task report, so the owner can judge the content.
  - Run `pnpm --filter @prepdesk/engine bench --run` and record the Pocket batch and 60-item batch times (target < 25 ms).
- [ ] **Step 6: Slice content sign-off (spec §4.6.6).** The controller dispatches one fresh reviewer over **all** S1b content for originality and tagging. Every finding is fixed (each fix re-runs the gates) before acceptance.
- [ ] **Step 7: Clean-clone acceptance (R29).**
  - Fresh `git clone` of the branch into the scratchpad, then `pnpm install --frozen-lockfile`.
  - Then `pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm content:lint && pnpm build && pnpm e2e --trace off`, all green.
- [ ] **Step 8: Commit** `feat(web): roll every new generator on /forge-preview; packs 0.2.0; S1 acceptance`. The controller then pushes, and S1 is complete only when the real GitHub Actions run for this commit is green.
