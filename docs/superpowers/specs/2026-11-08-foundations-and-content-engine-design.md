# Spec: Foundations + Content Engine (sub-projects 0 & 1)

**Date:** 2026-11-08 · **Status:** Awaiting owner review
**Parent docs:** `docs/research/2026-11-08-dm-prep-research.md`, `docs/research/2026-11-08-product-brief.md`
**Visual reference:** https://claude.ai/artifact/QBuwwnGsQtnqzgmr2sjiyZ ("Ink & Index")

---

## 1. Goal

Lay the two foundations everything else in Prep Desk stands on:

- **Sub-project 0, Foundations:** a working, installable, offline-capable web app shell with the Ink & Index design system (tokens, fonts, components), light and dark themes, and empty routes for the four modes.
- **Sub-project 1, Content Engine:** a pure-TypeScript library that turns hand-written content packs into reproducible, lockable, rerollable, context-aware and safety-filtered results. That covers cards (e.g. an NPC), names with voicing notes, single table rolls, the oracle and the GM moves deck.

These are specced together because the engine is useless without a surface to show it and the shell is empty without the engine. They ship as **two separate packages** with a clean boundary.

### Success criteria
1. `pnpm build` produces a static site that installs as a PWA on a tablet and loads with no network after first visit (fonts included).
2. A dev-only `/kit` page shows every Ink & Index component in light and dark, at 1194×834, passing automated accessibility checks.
3. A dev-only `/forge-preview` page generates NPCs from the starter pack: lock fields, reroll the rest, copy a seed code, paste it back, get the identical NPC.
4. The engine passes its test suite: determinism, locks, safety filtering, name distinctiveness, weight distribution and content linting.
5. Performance targets: one NPC < 5 ms; a Pocket-sized batch (≈60 results) < 100 ms on a mid-range tablet. In CI the benchmark is reported on every run (target < 25 ms for the batch) and becomes a hard failure once a baseline is set.

### Out of scope (later sub-projects)
Campaign Codex and persistence (beyond theme preference), Table Mode, Prep interview, accounts and sync, maps, exports, the full launch content (sub-project 2), system packs, genres beyond the fantasy starter, hosting account setup.

---

## 2. Repository layout

pnpm workspace monorepo:

```
/
├─ apps/
│  └─ web/                    # React + Vite PWA (sub-project 0)
│     ├─ src/
│     │  ├─ app/              # routes, layout, theme provider
│     │  ├─ kit/              # Ink & Index components
│     │  ├─ styles/           # tokens.css, base.css, fonts.css
│     │  └─ dev/              # /kit and /forge-preview (dev-only routes)
│     └─ e2e/                 # Playwright smoke tests
├─ packages/
│  ├─ engine/                 # @prepdesk/engine: pure TS, no DOM (sub-project 1)
│  └─ content-fantasy/        # @prepdesk/content-fantasy: YAML sources → compiled JSON pack
├─ tools/
│  └─ content-cli/            # compile + lint content packs
├─ docs/
└─ .github/workflows/ci.yml
```

**Boundary rule:** `engine` depends on nothing in the repo. `content-*` packages depend only on the engine's *types and schema*. `web` depends on both. The engine never touches the DOM, storage or network.

### Tooling
TypeScript (strict) · pnpm · Vite · React 18 · React Router · vite-plugin-pwa (Workbox) · Vitest + Testing Library · Playwright (tablet viewport) · @axe-core/playwright · ESLint + Prettier · zod (content schema) · `yaml` (parsing). CI on GitHub Actions: install → lint → typecheck → unit tests → content lint → build → Playwright smoke.

---

## 3. Sub-project 0: Foundations

### 3.1 App shell
- Routes: `/` (home), `/prep`, `/table`, `/codex`, `/forge`. Each is an empty-state screen in the Ink & Index style naming what will live there and linking to the others. Dev-only: `/kit`, `/forge-preview`.
- Top bar: wordmark, mode switcher, theme toggle. It collapses into a menu below 768px wide.
- Layout targets: **tablet landscape 1194×834 first**, then tablet portrait 834×1194, desktop 1440, phone 390. No horizontal page scroll at any of them.

### 3.2 Theme and tokens
- `tokens.css` defines CSS custom properties on `:root` (light) and `[data-theme="dark"]` plus `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`.
- Tokens, with day / night values from the brief:
  - `--paper`, `--card`, `--ink`, `--ink-muted`, `--rule` (index-card lines), `--margin-line`
  - `--pencil` (blue), `--highlight` (yellow), `--stamp` (red)
  - `--radius-card: 4px`, `--radius-pill: 999px`, spacing scale on a 4px base (4, 8, 12, 16, 20, 24, 32, 40)
  - type scale: 12 / 13 / 15 / 17 / 21 / 28 / 34 / 52
- The theme choice (light / dark / system) is stored in `localStorage` with try/catch and a safe fallback.
- **Fonts are self-hosted** via `@fontsource` packages, so the app works offline: Bricolage Grotesque (variable), Instrument Sans (variable), Shantell Sans (variable), JetBrains Mono (500/600). Font roles: `--font-display`, `--font-body`, `--font-hand`, `--font-mono`.

### 3.3 Ink & Index components (`apps/web/src/kit`)
Every component meets these rules: keyboard reachable, visible focus ring (2px `--pencil` offset ring), 44×44px minimum touch target for interactive parts, `prefers-reduced-motion` respected, and colour contrast ≥ 4.5:1 for text in both themes.

| Component | Purpose / notes |
|---|---|
| `InkFilter` | Renders the single hidden SVG `feTurbulence` + `feDisplacementMap` filter once at app root (`#ink-rough`). A `seed` prop lets variants look different |
| `InkOutline` | Absolutely positioned outline layer using the filter. **Applied to borders only, never to text** |
| `Card` | Index-card surface. Variants: `plain`, `ruled` (blue rules + red margin line), `taped` (tape strip). Optional `tilt` (−1°…1°), which is static; no card animates its tilt |
| `Button` | `solid` / `outline` / `dashed`; sizes `md` (44px) and `lg` (68px dock) |
| `IconButton` | Square icon-only button with required `label` (aria-label + tooltip) |
| `Chip` | Pill for cast members, tags and nudges; optional `onRemove` |
| `Tabs` | Pill tabs with roving tabindex |
| `Stamp` | Rotated rubber-stamp label (`IMPROVISED · S7`, `REVEALED`). Tones: stamp, pencil |
| `Highlight` | Highlighter background; `struck` variant = highlighter + line-through (the "used" mark) |
| `MarginNote` | Handwritten annotation in `--font-hand`, `--pencil` colour, optional arrow |
| `Clock` | Progress clock, 4/6/8 segments, `filled` count, inked; `onTick` makes it interactive; announced as "Clock: 3 of 6" |
| `Field` | Labelled text input / textarea (visible label always; hand font for answer fields) |
| `SectionLabel` | Small uppercase tracked label |
| `DockButton` | Icon + label tile for the generator dock |
| `Icon` | Inline stroke SVG set, starting with: name, npc, place, twist, treasure, encounter, map, search, moon, sun, lock, unlock, dice, copy |

`/kit` renders all of these with their variants in both themes.

### 3.4 PWA and offline
- vite-plugin-pwa with a precache of the app shell, fonts and compiled content packs. Navigation fallback to `index.html`.
- Web app manifest: name "Prep Desk", theme colours from tokens, icons (simple inked d20 mark), `display: standalone`, landscape-friendly.
- Update flow: when a new version is available, a quiet "Update ready, reload" chip appears. Never auto-reload mid-session.

### 3.5 Foundations tests
- Vitest + Testing Library: each interactive component (keyboard operation, aria attributes, Clock announcements, Tabs arrow-key navigation).
- Playwright at 1194×834: `/kit` in light and dark, with an axe scan returning zero serious or critical violations; every route renders; offline reload works after first load (service worker).

---

## 4. Sub-project 1: Content Engine (`@prepdesk/engine`)

### 4.1 Concepts

| Concept | What it is |
|---|---|
| **Pack** | A versioned bundle of content (tables, cultures, generators, oracle, moves) for a genre or theme. Authored as YAML, compiled to one JSON file |
| **Library** | One or more loaded packs merged into a lookup index. User-made tables are just another pack (`user.*`) layered on top |
| **Table** | A weighted list of short entries with tags |
| **Template** | Text with slots that pull from tables, context or sub-generators |
| **Culture** | Naming rules (sound parts + patterns), curated example names, and voicing notes |
| **Generator** | A card schema: named fields, each filled by a table, template, name rule or sub-generator |
| **Context** | What the result should fit: genre, culture, tags, safety settings, names to avoid, and a campaign lookup hook |
| **Card** | The output of a generator: fields with values, lock state and provenance, plus its seed |

### 4.2 Content format (YAML source)

**Table**
```yaml
kind: table
id: fantasy.npc.want
title: What they want right now
tags: [npc]
entries:
  - text: to pay off a debt before {fantasy.time.deadline}
    weight: 2
    tags: [debt, urban]
  - text: to get {family_member} out of {ctx.settlement.name|or:town}
    tags: [family]
  - text: revenge on whoever burned the old mill
    safety: [violence]
```
- `weight` defaults to 1. `tags` are free-form but linted against the pack's tag vocabulary. `safety` uses the **fixed safety vocabulary** (§4.7).
- `id` is namespaced `<pack>.<area>.<name>`. A short slot reference like `{family_member}` resolves within the same pack namespace first.

**Template slot syntax**
- `{table.id}`: roll one entry from a table.
- `{ctx.path}`: read from context (e.g. `{ctx.culture.name}`, `{ctx.campaign.activeFront.name}`).
- `{gen:generator.id.field}`: run a sub-generator and take one field.
- `{name}` / `{name:given}` / `{name:family}`: a name in the context culture.
- Modifiers, chained with `|`: `cap` (capitalise), `a` (a/an article), `or:<fallback text>` (used when a context value is missing).
- Nesting is allowed. The compiler rejects reference cycles. Runtime depth is capped at 8 as a safety net.

**Culture**
```yaml
kind: culture
id: fantasy.culture.marsh
name: Marsh-folk
genre: fantasy
voice:
  summary: slow vowels, drop the final g, never says no
  tips:
    - Stretch the vowels; nobody here hurries.
    - Refuse indirectly: "tide's not right."
    - Swear by the water: "by the low tide".
names:
  given:
    pattern: [start, mid?, end]
    parts:
      start: [O, Il, Tam, Wen, Mer, Fen]
      mid: [dr, s, ra, wy]
      end: [in, a, sin, row, na]
  family:
    pattern: [start, end]
    parts:
      start: [Vey, Mer, Fen, Brack, Sal]
      end: ['', row, wick, by]
  format: "{given} {family}"
  examples: [Odrin Vey, Ilsa Merrow, Tamsin Fenwick, Wenna Brack]
  exampleChance: 0.25
  banned: ["(.)\\1\\1", "^.{0,2}$", "aa"]
```
- `?` marks an optional part (50% unless weighted as `mid?:0.3`).
- `exampleChance` mixes curated names in with generated ones; `banned` regexes reject ugly results (retry up to 20 times).

**Generator**
```yaml
kind: generator
id: fantasy.npc
title: Instant NPC
fields:
  name:   { name: full }
  role:   { table: fantasy.npc.role }
  look:   { table: fantasy.npc.look }
  want:   { table: fantasy.npc.want }
  secret: { table: fantasy.npc.secret }
  voice:  { culture: voice.summary }
  tell:   { table: fantasy.npc.tell }
display: "{name}, {role|a}"
```
Field sources: `table`, `template` (inline text with slots), `name` (`full` | `given` | `family`), `culture` (a path into the context culture), `gen` (sub-generator, e.g. a tavern's `keeper: { gen: fantasy.npc }`, which gets the parent's context), and `pick` (choose N distinct entries from a table, e.g. 3 aspects).

**Oracle and moves** (original content, no third-party table text)
```yaml
kind: oracle
id: fantasy.oracle
odds:            # d100 thresholds per likelihood
  certain:   { yes: 90, extreme: 15 }
  likely:    { yes: 70, extreme: 10 }
  even:      { yes: 50, extreme: 8 }
  unlikely:  { yes: 30, extreme: 5 }
  remote:    { yes: 10, extreme: 3 }
meaning: [fantasy.meaning.action, fantasy.meaning.theme]
```
Extreme results add "and…" (a strong yes or no) and near-threshold results add "but…". The exact rules are in §4.5.
```yaml
kind: deck
id: core.gm-moves
title: GM moves
cards:
  - id: quiet-promise-comes-due
    text: Let a quiet promise come due
    prompt: What do they learn that they really didn't want to know?
```

### 4.3 Compiling and linting (`tools/content-cli`)
- `prepdesk-content build <packDir>` → `dist/<pack>.json`: YAML parsed, validated against zod schemas, slots pre-parsed into an AST, ids indexed.
- `prepdesk-content lint <packDir>` fails on:
  - duplicate ids; unresolved slot references; reference cycles
  - empty tables; non-positive weights
  - unknown safety tags; tags missing from the pack vocabulary
  - culture name rules that can't produce 20 distinct valid names in 500 tries
  - generator fields that reference missing sources
- Both run in CI. The web app imports compiled JSON only.
- The same validation runs at runtime when loading **user packs**, returning readable errors instead of throwing.

### 4.4 Randomness, seeds and reproducibility
- PRNG: `sfc32` seeded from a 128-bit hash of a string (`cyrb128`). It's fast, has no dependencies, and is deterministic across browsers.
- **Seed code:** 8 characters of Crockford base32 shown as `K7Q2-M9XD`, generated from `crypto.getRandomValues` when no seed is given.
- **Field-level determinism:** each field's seed is `hash(cardSeed, fieldName, nonce)`. A fresh card has every nonce at 0.
  - **Reroll:** increments the nonce of every *unlocked* field and regenerates those fields only. Locked fields keep their value exactly.
  - **Sharing (share codes v2):** a share code is `SEED[.C<culture tag>][.L<lock mask>.N<nonces joined by _>]` followed by one Crockford check symbol, e.g. `K7Q2-M9XD.C85NG.L3.N0_2_2_0_1_0_0` plus its check symbol.
    - The culture tag is `cultureTag(cultureId)`: a stable 4-character Crockford tag derived by hash from the culture id. Decoding resolves it against the library's cultures (unknown tag: `unknown-culture`), and it overrides the pasting context's culture. `loadPacks` rejects a library where two cultures share a tag.
    - The check symbol is the base-32 value of the body mod 37 (symbols `0-9A-Z` without I, L, O, U, then `*~$=U`). Case, whitespace and O/I/L are forgiven before the check. Any single-character substitution is detected (`checksum`), so plain words such as "nonsense" are not codes.
    - Locks and nonces are left out when nothing is locked and every nonce is 0; the culture and the check symbol are always present when the card has a culture.
  - **What a code guarantees:** a code rebuilds the card under the same context and pack version. A kept (locked) field that was made under other settings (another culture, other lines, other avoided names) cannot be rebuilt from a code. `cardToShare` therefore returns `{ code, exact }`, where `exact` is true only when rebuilding the code under the card's own context reproduces every field value. When it is false the UI says so and offers the card data instead.
  - **Card data:** `serializeCard(card)` gives JSON that `parseCard` reads back exactly (validated); the Codex stores cards this way.
- Reproducibility is guaranteed for the same pack version. Each card records `packVersion`; if the pack changes, the card keeps its stored text (cards never silently change). `parseCard` reports such a card as `stale`.

### 4.5 Public API (sketch)

```ts
// Loading
loadPacks(packs: CompiledPack[]): Library
validateUserPack(src: unknown): { ok: true; pack: CompiledPack } | { ok: false; errors: ContentError[] }

// Generating
generate(lib: Library, generatorId: string, opts?: GenOptions): Card
reroll(lib: Library, card: Card, opts?: { locks?: string[]; context?: Context }): Card
rollTable(lib: Library, tableId: string, opts?: GenOptions): RollResult
generateName(lib: Library, cultureId: string, opts?: NameOptions): NameResult
batch(lib: Library, requests: BatchRequest[], opts?: GenOptions): Card[]   // used by the Pocket later

applySafety(lib: Library, card: Card, opts?: { context?: Context }): Card   // §4.7, rerolls nothing

// Improv aids
askOracle(lib: Library, oracleId: string, likelihood: Likelihood, opts?: { seed?: string; safety?: SafetySettings }): OracleResult
drawMove(lib: Library, deckId: string, opts?: { seed?: string; exclude?: string[]; safety?: SafetySettings }): MoveCard

// Seeds and sharing (§4.4)
newSeed(): string
cardToShare(lib: Library, card: Card): { code: string; exact: boolean }
cardFromShare(lib: Library, generatorId: string, code: string, context?: Context):
  { ok: true; card: Card } | { ok: false; error: 'malformed' | 'field-count' | 'checksum' | 'unknown-culture' }
cultureTag(cultureId: string): string
encodeShare(state: ShareState): string
decodeShare(code: string, fieldCount: number):
  { ok: true; state: ShareState } | { ok: false; error: 'malformed' | 'field-count' | 'checksum' }
type ShareState = { seed: string; nonces: number[]; locks: boolean[]; culture?: string }   // field order

// Card data (the Codex stores cards as JSON)
serializeCard(card: Card): string
parseCard(lib: Library, json: string): { ok: true; card: Card; stale: boolean } | { ok: false; error: 'json' | 'schema' }

interface GenOptions {
  seed?: string
  context?: Context
}

interface Context {
  genre?: string
  cultureId?: string
  tags?: { require?: string[]; prefer?: string[]; exclude?: string[] }
  safety?: SafetySettings
  avoidNames?: string[]            // for the distinctiveness guard
  campaign?: CampaignLookup        // hook; the Codex will implement it in sub-project 3
  [key: string]: unknown           // e.g. settlement: { name: "Saltmere" }
}

interface CampaignLookup {
  get(path: string): string | undefined   // e.g. "activeFront.name"
}

interface Card {
  id: string                    // uuid
  generatorId: string
  packVersion: string
  seed: string
  fields: Record<string, CardField>
  display: string               // rendered display line
  context: SerializableContext
  flags: { veiled: string[]; relaxed: boolean }   // veiled tags shown; any field (or the display) relaxed
}

interface CardField {
  value: string
  locked: boolean
  nonce: number
  sources: string[]             // entry ids behind the visible text, for "why this?" and editing
  blocked?: true                // value is '—': a Line excludes this content
  relaxed?: true                // selection loosened a filter to fill this field (UI: LOOSENED)
  hidden?: { value: string; sources: string[]; relaxed?: boolean }   // content a current Line hides; restored when the Line goes
}

interface NameResult {
  name: string; given: string; family?: string
  cultureId: string; voice: { summary: string; tips: string[] }
  fromExamples: boolean
}

interface OracleResult {
  roll: number; likelihood: Likelihood
  answer: 'yes' | 'no'; modifier?: 'and' | 'but'
  meaning: [string, string]
  blocked: boolean; veiled: string[]   // a word hidden by a Line shows '—' and sets blocked
}

interface MoveCard {
  id: string; text: string; prompt: string
  blocked: boolean   // every card is behind a Line: { id: '', text: '—', prompt: '', blocked: true }
  veiled: string[]   // veiled tags the drawn card carries
}
```

**Display line:** the display renders over the finished field values. It shows "nothing fits your safety settings" only when it uses a blocked field (a field reference, or `{name}` when the generator has a `name` field) or one of its own slots is blocked. A `gen` field shows the sub-card's display and records that display's provenance.

**Oracle rule:**
- `answer` is yes if `roll ≤ yes`, otherwise no.
- `and` applies if `roll ≤ extreme` (an emphatic yes) or `roll > 100 − extreme` (an emphatic no).
- `but` applies if `|roll − yes| ≤ 5`.
- If both would apply, `and` wins (a result never has both).
- Two meaning words are always included.

### 4.6 Tag handling and context inheritance
- **Filtering order:** genre → `require` (entry must have all) → `exclude` (entry has none) → safety (§4.7). If filtering empties a table, fall back step by step (drop `prefer`, then `require`) and record `relaxed: true` on the result. Never return nothing for a non-empty table.
- **Prefer:** entries carrying a `prefer` tag get their weight multiplied by 3.
- **Inheritance:** a sub-generator receives the parent's context merged with anything the parent sets explicitly (e.g. a tavern passes `{ settlement, cultureId }` to its keeper). Parent context values never get overwritten by child defaults.

### 4.7 Safety
- **Fixed safety vocabulary (v1):**
  - violence, gore, death, torture, sexual-content, abuse, child-harm, self-harm, suicide
  - addiction, slavery, body-horror, insects, spiders, rats, drowning, fire, claustrophobia
  - religion, hate-bigotry, animal-harm, pregnancy, mental-illness, police, war
- `SafetySettings = { lines: string[]; veils: string[] }`.
  - **Lines:** entries with any of these tags are never selected, including inside nested slots.
  - **Veils:** entries may be selected, but the result lists them in `flags.veiled` so the UI can show "fade to black" styling.
  - **Changing settings on an existing card:** `applySafety` re-evaluates a card without rerolling. A field whose content carries a current Line is blocked and keeps its content in `hidden`; removing the Line restores it. A field blocked when it was generated is regenerated at its own nonce only when a Line is removed. Every other field keeps its value, sources and nonce. Locks never override a Line (R22).
  - **GM moves decks:** deck cards may carry `safety` tags like table entries. `drawMove` never draws a lined card (never relaxed) and reports veiled tags.
- **Default lines** for a new campaign: `child-harm`. Everything else is chosen in session zero (sub-project 8).
- The compiler requires every entry that touches a vocabulary topic to carry its tag. Content review guidance lives in `packages/content-fantasy/CONTRIBUTING.md`.

### 4.8 Name distinctiveness guard
Given `avoidNames` (e.g. recent campaign NPCs), reject a candidate whose given name:
- shares its first letter with any of the last 8 names in `avoidNames`, or
- is within edit distance 2 of any name in `avoidNames`, or
- shares its first three letters with any name in `avoidNames`.

Retry up to 20 times, then relax one rule at a time (first letter → three letters → edit distance) and mark `relaxed: true`. The name generator also never returns the same full name twice within a `batch()` call.

### 4.9 Starter content (in this sub-project)
Only enough to build and test against. The full launch catalogue is sub-project 2.
- `@prepdesk/content-fantasy` v0.1:
  - 3 cultures (Marsh-folk, Highland, Imperial coast), each with name rules, 8+ examples and a voicing summary + 3 tips.
  - Tables for the `fantasy.npc` generator: role, look, want, secret, tell, ~20 entries each, safety-tagged.
  - One oracle with two meaning tables of 30 words each.
- `core` pack: the GM moves deck (12 original moves).
- All content is original writing, licensed CC-BY-4.0 (`LICENSE-CONTENT` in each content package).

### 4.10 `/forge-preview` (dev page wiring engine to the kit)
- Pick a culture and generate an NPC card (rendered with `Card` variant `ruled`).
- Each field has a lock toggle (`IconButton` lock/unlock). **Reroll** rerolls unlocked fields.
- The share code is shown with a copy button. Pasting a code reproduces the card, whichever culture tab is selected. When the code is not exact (§4.4), the page says so and offers "Copy card data"; the paste field also accepts card data.
- A "Names" strip shows 10 names with voicing notes; an `avoid` box tests the distinctiveness guard.
- Oracle panel (likelihood tabs → answer + meaning) and "Draw a move".
- Toggle example safety lines/veils and see entries disappear or get flagged (`applySafety`: nothing else rerolls). A field picked with a loosened filter is stamped LOOSENED.

---

## 5. Error handling
- **Content errors** (bad user pack, missing reference): typed `ContentError { code, message, path, packId }`. User packs that fail validation load nothing and return all errors, so one bad table can't break a session.
- **Runtime generation never throws for a valid library.** Missing context values use `or:` fallbacks or the slot is rendered as `[missing: ctx.x]` in dev and dropped quietly in production, with a console warning.
- **Storage** (theme only, in this sub-project): every `localStorage` access is wrapped; failures fall back to the system theme.
- **Service worker** failures never block the app; it simply runs online-only.

---

## 6. Testing strategy

| Area | Tests |
|---|---|
| PRNG/seeds | Same seed → same sequence; seed codes round-trip; share codes round-trip |
| Determinism | Snapshot: `generate(fantasy.npc, seed "TEST-0001")` equals a stored fixture |
| Locks | After N rerolls, locked fields are byte-identical; unlocked fields changed in ≥ 95% of 1,000 trials |
| Weights | 10,000 rolls of a 3-entry table with weights 1/2/7 land within ±2% of expected |
| Tags | `require` / `exclude` / `prefer` behave; relaxation sets `relaxed: true` and never returns empty |
| Safety | Lines never appear across 10,000 generations, including nested slots; veils are flagged |
| Names | Banned patterns never produced; distinctiveness rules enforced; no duplicates in a batch; example mixing rate ≈ `exampleChance` |
| Oracle | Boundary rolls produce the correct answer and modifier for each likelihood |
| Templates | Modifiers (`cap`, `a`, `or:`), nesting, cycle rejection at compile time, depth cap at runtime |
| Content lint | Each lint rule has a failing fixture pack |
| Performance | NPC < 5 ms; batch of 60 < 25 ms on CI (benchmarked with Vitest bench, reported, soft-fail initially) |
| Web | Component tests; Playwright `/kit` light/dark + axe; `/forge-preview` lock → reroll → share code → paste reproduces; offline reload |

Engine target: ≥ 90% line coverage.

---

## 7. Decisions recorded here
- Monorepo with a DOM-free engine package, so the same engine can later power a CLI, a Foundry module, or server-side generation without changes.
- Content authored in YAML for readability by non-programmers, compiled to JSON for speed. YAML is never parsed at runtime, except for user-imported packs.
- Fonts self-hosted, not Google Fonts, because offline at the table is a requirement.
- No state library yet. React state is enough until the Codex (sub-project 3) brings IndexedDB/Dexie.
- Hosting: the build is a static `dist/`. Connecting it to a host (Cloudflare Pages / Netlify) needs the owner's account and happens when there's something worth showing (milestone M1).
