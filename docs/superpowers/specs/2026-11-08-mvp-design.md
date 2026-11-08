# Spec: Prep Desk MVP (the full loop, fantasy, offline)

**Date:** 2026-11-08 · **Status:** Written under the owner's standing delegation (Ruling R34). The owner can redirect any decision in §15.
**Parent docs:** `docs/research/2026-11-08-product-brief.md` (§1, the owner's answers, is binding), `docs/research/2026-11-08-dm-prep-research.md`, `docs/superpowers/specs/2026-11-08-foundations-and-content-engine-design.md` (the "foundations spec"), `.ux-profile.md`, `docs/ui-page-patterns.md`.
**Approved visuals:** the owner-approved mockups `Main.dc.html` (Table Mode) and `PrepDesk.dc.html` (Prep interview), from the "Ink & Index" canvas linked in the brief.

---

## 1. Goal

A game master can run the whole Prep Desk loop on a tablet, offline, for a fantasy campaign:

1. **Create a campaign:** a name, the genre (fantasy), and session-zero safety (lines and veils from the 25-topic vocabulary; `child-harm` is a line by default).
2. **Prep** with a six-step interview: The Table, Last Time, The Pressure, The Opening, Truths & Places, The Pocket. It takes 30 minutes or less (about 5 per step) and produces cards.
3. **Run the session in Table Mode** with no network: Tonight's Pocket, the Spread (scene, focus card, front clock), the Ledger auto-log, the Dock generators, Stuck?, the oracle and the moves deck.
4. **Wrap up** in about 2 minutes: triage every improvised thing (keep / shortlist / let go). The recap drafts itself.
5. **Find anything later** in the Codex: local IndexedDB, wiki links, universal "Pull anything" search, and a minimal relationship view.
6. **Export** the campaign as a JSON backup and as Markdown (an Obsidian-style vault).

Ruling R35 defines the MVP. §14 lists everything outside it.

### 1.1 MVP acceptance (whole product)

The MVP is done when all of these hold on the branch's real CI and on a clean clone (R29):

- **A1** e2e journey J1 (§12.3) passes at 1194×834, 834×1194, 1440×900 and 390×844. J1 covers create campaign → all six prep steps → start session → use the Pocket, Dock, Stuck?, oracle and moves, tick a clock, mark a clue found → end session → wrap-up triage → save the recap → find an improvised NPC through Pull anything in the Codex → export JSON and Markdown.
- **A2** Journey J2 (offline) passes. After one online visit the browser goes offline, reloads, runs a full session, reloads again, and every Ledger event and entity is still there.
- **A3** Journey J3 (safety) passes. With seeded content, a line removes tagged entries from the Pocket, the Dock, Stuck?, oracle meaning words and moves. Toggling a line mid-session changes only the affected fields (no reshuffle), and removing the line restores them.
- **A4** axe reports zero serious or critical violations on every route, in light and dark.
- **A5** Every interactive element on every route is at least 44×44 px. No route scrolls horizontally at any of the four widths.
- **A6** Performance budgets in §6.9 are met: the measured ones in CI, the device ones in a manual check on a mid-range tablet before the MVP is called done.
- **A7** `pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm content:lint && pnpm build && pnpm e2e --trace off` is green from a fresh clone, and the real GitHub Actions run for the final commit is green.
- **A8** The `ux-audit` skill passes for every MVP screen. `docs/ui-page-patterns.md` names the built pattern for every route.

---

## 2. Inputs, constraints and changes to the foundations spec

### 2.1 Binding constraints carried forward

- Engine boundary, safety-first, original content, namespaced ids, field references only in `display` (R23), accessibility, tokens-only styling, self-hosted fonts and TDD all come from `CLAUDE.md` and still apply.
- **Safety beats everything** (R22): lines are never selected, never relaxed, and they override locks. This spec adds no exception.
- **Never auto-reload mid-session** (foundations §3.4).
- Every root script works from a clean checkout (R29). A task is complete only when its real CI run is green.

### 2.2 Engine API this spec builds on (P0, being delivered now)

The P0 batch (progress ledger, "MVP PHASE") adds the following. This spec uses these names. If the delivered signatures differ, the delivered ones win: implementers adapt call sites and keep the semantics.

| API                                                                                                         | Meaning used by this spec                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cardToShare(lib, card): { code: string; exact: boolean }`                                                  | Share code v2. It carries the seed, nonces, locks, culture id and a Crockford check character. `exact: false` means the code only reproduces the card under the same context and pack version.                                                                                                          |
| `cardFromShare(lib, generatorId, code, context?)`                                                           | Rebuilds a card. A bad check character returns `{ ok: false, error: 'malformed' }`.                                                                                                                                                                                                                     |
| `serializeCard(card): string` / `parseCard(json): { ok: true; card: Card } \| { ok: false; error: string }` | The JSON stored in the Codex. It keeps every value as it was rolled.                                                                                                                                                                                                                                    |
| `applySafety(lib, card, { context }): Card` (landed in `13a7cf8`; the new safety goes in `context.safety`)  | Re-checks a card against new lines and veils without a reshuffle. A field whose sources now carry a line becomes `—` (`blocked`), and its original value, sources and relaxed mark are kept in `field.hidden`. When the line is removed, the hidden value comes back unchanged. No other field changes. |
| `drawMove(lib, deckId, { seed?, exclude?, safety? })`                                                       | Deck cards carry `safety` tags. A lined card is never drawn. The result includes `veiled: string[]`.                                                                                                                                                                                                    |
| `card.flags.relaxed` and per-field `relaxed` (landed in `fdbf472`)                                          | Shown in the UI as a **LOOSENED** stamp on the field, with the tooltip "Nothing matched every filter, so one was loosened."                                                                                                                                                                             |
| Display blanking                                                                                            | The display line blanks only when it uses a blocked field.                                                                                                                                                                                                                                              |

### 2.3 Deliberate changes to the foundations spec

1. **Situations (tag pairs) are a new content kind with two new field sources** (§4.2). This extends foundations §4.2 and §4.5 and keeps every boundary rule.
2. **The Codex does not implement `CampaignLookup` in the MVP** (Decision D3). Content reads plain, serialisable context keys (`ctx.settlement.name`, `ctx.front.name`, `ctx.mention.name`, `ctx.pc.name`, `ctx.pc.want`, `ctx.truth.text`). The hook stays in the engine, unused.
3. **`apps/web/src/dev/engine.ts` moves to `apps/web/src/content/lib.ts`.** The dev pages import it from the new place.

---

## 3. Architecture

### 3.1 Layers

```
packages/engine            pure TS (+ situations, §4.2)          no DOM, storage or network
packages/content-core      moves deck (24 cards, safety-tagged)  YAML → dist/core.json
packages/content-fantasy   cultures, tables, generators,         YAML → dist/fantasy.json
                           situations, oracle
apps/web/src
  kit/        Ink & Index components (existing + new, §3.4)
  app/        shell: routes, TopBar, FocusBar, UpdateChip, ThemeProvider, ErrorBoundary, banners
  content/    lib.ts (loadPacks once), safety.ts (campaign → Context), labels.ts (topic labels)
  data/       db.ts (Dexie), schema.ts (types), repo/*.ts, search.ts, export/*.ts, ids.ts, storage.ts
  features/
    campaign/ Home, CampaignList, CampaignForm, CampaignSettings, SafetyPicker
    prep/     PrepWizard, StepRail, steps/Step1..Step6, DraftCard, ShortlistPanel, drafting.ts
    table/    TableMode, TableBar, Pocket, Spread, Ledger, Dock, DockTray, Stuck, Oracle, Moves,
              pocket.ts (buildPocket), actions.ts (use = log), timer.ts
    wrap/     WrapUp, RecapForm, recap.ts (draftRecap)
    codex/    CodexList, EntityDetail, EntityForm, WikiText, Connections, History, PullAnything
```

The rules:

- `features/*` may import `kit`, `content`, `data` and `app`. `data` imports `@prepdesk/engine` types and functions only. It never imports React, except `data/hooks.ts`, which wraps `useLiveQuery`.
- **Engine calls live in pure modules** (`pocket.ts`, `drafting.ts`, `recap.ts`, `actions.ts`) that take `lib`, `db` and a seed as arguments. That keeps them unit-testable without React.
- **Dependencies added:** `dexie@^4`, `dexie-react-hooks@^1`, `fake-indexeddb@^6` (a runtime dependency, loaded lazily only for the in-memory fallback, D26), and `fflate@^0.8` for the Markdown zip (D24). Nothing else.

### 3.2 State management

- **Durable state lives in Dexie. Reads use `useLiveQuery`.** Writes are **write-through** (D44): an action writes to Dexie inside one transaction and the UI updates through the live query. There is no optimistic copy, so there is nothing to reconcile.
- **Ephemeral UI state uses React state.** That covers the open tray and its unsaved card, the open popover and the search text. Table Mode shares it through one `TableUiContext` (`useReducer`). No state library is added.
- **The engine library loads once,** at module scope in `content/lib.ts`.

### 3.3 Routes and navigation

The current campaign is stored in `settings.currentCampaignId`. The old top-level paths redirect, so existing links keep working.

| Route                                  | Screen                                                                                                                                    | Pattern (page-patterns)             | Chrome   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------- |
| `/`                                    | Home: the current campaign at a glance, or first run                                                                                      | 4 Dashboard / Overview              | TopBar   |
| `/campaigns`                           | All campaigns                                                                                                                             | 1 List / Index                      | TopBar   |
| `/campaigns/new`                       | Create campaign                                                                                                                           | 3 Form (page)                       | TopBar   |
| `/c/:cid/settings`                     | Campaign settings, safety, data                                                                                                           | 5 Settings                          | TopBar   |
| `/c/:cid/prep/:sid/:step` (`step` 1–6) | Prep interview                                                                                                                            | 3 Form (wizard)                     | FocusBar |
| `/c/:cid/table/:sid`                   | Table Mode                                                                                                                                | **Console** (new, §6.1, D13)        | TableBar |
| `/c/:cid/wrap/:sid`                    | Wrap-up triage                                                                                                                            | 10 Inbox / Activity Feed, variant A | TopBar   |
| `/c/:cid/wrap/:sid/recap`              | Recap draft                                                                                                                               | 3 Form (page)                       | TopBar   |
| `/c/:cid/codex`                        | Codex index                                                                                                                               | 1 List / Index                      | TopBar   |
| `/c/:cid/codex/:eid`                   | One entry                                                                                                                                 | 2 Detail / Record                   | TopBar   |
| `/prep`, `/table`, `/codex`            | Redirect to the current campaign's next or live session (`/prep`, `/table`) or its Codex. With no campaign, redirect to `/campaigns/new`. | none (redirect)                     | none     |
| `/forge`                               | Removed from navigation and redirected to `/` in the MVP (D27). `/kit` and `/forge-preview` stay dev-only.                                | none                                | none     |

- **TopBar** (existing): wordmark, mode keys **Prep · Table · Codex** (campaign-scoped) and **Pull anything** (a search key that opens the same combobox as Table Mode, §5.6). An overflow menu holds Campaign settings, All campaigns and Theme. Below 768 px it collapses into the existing Menu.
- **FocusBar** (Prep): wordmark, "Prepping Session 8", campaign name, "14 min in · about 16 to go" and **Save and finish later** (goes to `/`). It has no mode keys, so the interview keeps the DM's attention (D29).
- **TableBar** (Table Mode): §6.2.
- **Unknown ids** (campaign, session or entry) render an in-pattern not-found state: "We can't find that session. It may have been deleted." with **Go to the desk**.

### 3.4 New kit components

All of them follow foundations §3.3: keyboard reachable, 2 px pencil focus ring, 44 px targets, reduced motion, and 4.5:1 contrast. Keys are the raised R31 style.

| Component    | Purpose                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Popover`    | A non-modal anchored panel (oracle, moves, Shortlist list). Escape closes it and returns focus to its trigger. Opening takes ≤150 ms and has no motion under reduced motion. |
| `Tray`       | A non-modal panel above the Dock (`role="dialog"`, `aria-modal="false"`). Focus moves into it. Escape closes it and returns focus to the tile.                               |
| `Dialog`     | A modal confirm that traps focus. Destructive confirms name the entity, put the destructive verb in stamp red, and give Cancel the default focus.                            |
| `SlideOver`  | A modal edit panel from the right (Codex edit, create entry). On narrow screens it is full width.                                                                            |
| `Segmented`  | A row of 2–4 keys acting as a radio group (`role="radiogroup"`). Used for the Fine / Veil / Line safety control.                                                             |
| `Combobox`   | The ARIA 1.2 combobox plus listbox behind Pull anything.                                                                                                                     |
| `LockToggle` | An `IconButton` with `aria-pressed`, labelled "Lock {field}" or "Unlock {field}".                                                                                            |
| `CardFields` | Renders card fields as label and value rows, with an optional `LockToggle` per row, `—` for blocked fields, the veil note (D12) and the LOOSENED stamp.                      |
| `Banner`     | A full-width notice inside the page, with tones info and warning and an optional action. Used for storage, update and fallback notices.                                      |
| `EmptyState` | A header, one value sentence and a primary CTA, rendered inside the pattern's frame. No illustrations.                                                                       |
| `Kbd`        | The keyboard hint shown in tooltips and in the shortcuts dialog.                                                                                                             |

Icons added to `Icon` (22 px box, 1.7 stroke): `stuck`, `oracle`, `moves`, `ledger`, `pause`, `play`, `undo`, `pin`, `shortlist`, `export`, `plus`, `more`, `close`, `check`, `clock`.

### 3.5 Build slices in dependency order

Each slice ends shippable: all checks green on a clean clone, real CI green, reviewed. The plan breaks each slice into tasks.

| Slice                                                        | Delivers                                                                                                                                                 | Depends on                             | Independently testable because                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| **S1 Content** (S1a engine and generators, S1b full content) | situations in the engine, 14 new generators, tables to count, moves deck safety, culture expansion                                                       | P0                                     | it is pure engine and content, tested in Vitest with no UI                        |
| **S2 Persistence and Codex**                                 | Dexie schema, repositories, wiki links, search, export and restore, campaign create, settings and Home, Codex list and detail                            | S1 (card shapes)                       | Codex entries can be created by hand; it works with no Table or Prep              |
| **S3 Table Mode**                                            | Console layout, Pocket, Spread, Ledger, Dock, trays, Stuck?, oracle, moves, clocks, use = log with undo, session lifecycle, offline and update behaviour | S1, S2                                 | a session can start with no prep (D32); fronts and scenes can come from the Codex |
| **S4 Prep, wrap-up and shortlist**                           | the six-step interview with drafting, wrap-up triage, recap draft, shortlist flows                                                                       | S1, S2, S3 (`buildPocket`, the Ledger) | each step and the wrap-up run against fixture sessions                            |
| **S5 Hardening**                                             | e2e journeys J1–J3 at four viewports, axe, hit targets, empty and error states, onboarding, data safety, update flow, deploy note                        | S1–S4                                  | it is the acceptance layer for the whole MVP                                      |

---

## 4. Slice S1: content

S1 ships in two halves: **S1a** delivers the engine situations, every new generator and minimum content (8 entries per table), and **S1b** brings every table up to the counts below. Each half is independently green.

### 4.1 Context keys the content may read

`ctx.settlement.name`, `ctx.front.name`, `ctx.place.name`, `ctx.mention.name`, `ctx.pc.name`, `ctx.pc.want`, `ctx.truth.text`. Every use carries an `or:` fallback (for example `{ctx.front.name|or:the old guild}`), so each generator reads well with an empty context. The web app builds the context in `content/safety.ts → contextFor(campaign, extras)`. That function always sets `genre: 'fantasy'`, `safety` from the campaign and `avoidNames` from §5.2.

### 4.2 Situations: tag pairs, our own design (D1, D2)

Kevin Crawford's method gives a place two tags, and each tag supplies people, problems and things. We implement the method with our own structure, names and text, and we copy no published tag list.

**Source format (new `kind: situation`):**

```yaml
kind: situation
id: fantasy.situation.salt-tithe
title: Salt tithe
summary: A powerful house takes a cut of the salt everyone needs to live.
tags: [coastal, trade]
safety: [] # tags for the title + summary themselves
facets: # all six required, each 3+ entries (4 recommended)
  enemy:
    - text: a tithe-reeve who weighs every sack twice and keeps the difference
  friend:
    - text: a salt-boiler's widow who knows which scales are crooked
  complication:
    - text: the tithe is the only thing keeping the dyke repaired
  thing:
    - text: an honest set of brass scales, wrapped in oilcloth
  place:
    - text: the boiling sheds, where nobody can hear you over the pans
  pressure:
    - text: at the next new moon the tithe doubles, and the reeve brings guards
```

- The six facets are **enemy, friend, complication, thing, place, pressure**. `pressure` is ours: one line saying what happens if nobody acts. Prep step 3 offers it as a nudge, and it can seed a new front.
- Facet entries have the normal entry shape (`text`, `weight`, `tags`, `safety`), so slots and safety work unchanged.
- Situation ids live under `<pack>.situation.<slug>`. The word "tags" is never used for situations, because pack `tags` are the linted filter vocabulary.

**Compiled shape.** `compileDocs` turns each situation into:

- one plain table per facet, with id `<situationId>.<facet>`, title `"<title>: <facet>"` and the situation's `tags`. These are ordinary `CompiledTable`s.
- one entry in the pack-level index table `<packId>.situations`. Its entry text is the title, its `tags`, `safety` and `weight` come from the situation, and a new compiler-only field `ref: <situationId>` is added to `CompiledEntry`.
- `pack.situations[id] = { id, title, summary, genre?, tags, safety, facets: Record<Facet, tableId> }`. `Library` gains `situation(id)`.

**New field sources** (added to the field-source union):

```yaml
fields:
  a: { situation: { table: fantasy.situations } }
  b: { situation: { table: fantasy.situations, distinctFrom: a } }
  enemy: { facet: { of: a, name: enemy } }
```

- `situation` rolls the index table through the existing `rollInto` → `selectEntry` path, so genre, tags, lines, veils and relaxation all apply exactly as for any table. `distinctFrom` passes the other field's chosen entry index as already-chosen, the same mechanism `pick` uses. The value is the situation title, and `sources` holds the index entry id.
- `facet` reads the `of` field's source entry, follows `entry.ref` to the situation, and rolls `<situationId>.<facet>` with the field's own rng through `rollInto`. If the `of` field is blocked, the facet field is blocked too.
- **Single safety choke point:** neither source selects text any other way. Both always end in `selectEntry`.
- **Generation order:** fields generate in a topological order over the `distinctFrom` and `of` edges, otherwise in declared order. Share codes still encode the declared field order.
- **Locks** behave as for any field: a locked facet keeps its value when its situation rerolls. R22 still blanks it if a line now applies.

**Lint rules (new):**

1. `of` and `distinctFrom` must name a field of the same generator whose source is `situation`.
2. Dependency cycles between fields are reported as `cycle`.
3. Every situation has all six facets, each with at least 3 entries (`schema`).
4. A situation's title, summary and facet entries follow the normal safety vocabulary.
5. Duplicate situation ids are reported as `duplicate-id`.

Facet tables are not linked to templates, so R23 is unaffected.

**Originality rule for situations:** each title is a two-word or three-word phrase we wrote ourselves, such as "Salt tithe", "Borrowed saint", "Drowned bell-tower", "Debt of oars" or "Wolf-tax". A reviewer checks every title against the published tag lists of Worlds Without Number, Stars Without Number and Cities Without Number. Any match, or a near match such as a pluralised one, is renamed. Every facet line is our own writing.

### 4.3 Generators (fields, sources, display)

All generator ids are `fantasy.*`. A **field reference** (`{name}`) appears only in `display`.

| Generator                | Fields (source)                                                                                                                                                                                                                                              | `display`                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| `fantasy.npc` (exists)   | unchanged                                                                                                                                                                                                                                                    | `{name}, {role\|a}`        |
| `fantasy.place`          | name (`fantasy.place.name`), kind (`fantasy.place.kind`), sight / sound / smell (`fantasy.place.sight` / `.sound` / `.smell`), happening (`fantasy.place.happening`)                                                                                         | `{name}, {kind\|a}`        |
| `fantasy.settlement`     | name (`fantasy.settlement.name`), size (`fantasy.settlement.size`), knownFor (`fantasy.settlement.known-for`), trouble (`fantasy.settlement.trouble`), power (`fantasy.settlement.power`), sight / sound / smell (place tables)                              | `{name}, {size\|a}`        |
| `fantasy.tavern`         | name (`fantasy.tavern.name`), keeper (`{ name: full }`), keeperWay (`fantasy.tavern.keeper-way`), sight / sound / smell (place tables), menu (`fantasy.tavern.menu`), regular (`fantasy.tavern.regular`), rumor (`{ template: '{gen:fantasy.rumor.text}' }`) | `{name}, kept by {keeper}` |
| `fantasy.shop`           | name (`fantasy.shop.name`), kind (`fantasy.shop.kind`), keeper (`{ name: full }`), wares (`{ pick: { table: fantasy.shop.ware, count: 3 } }`), oddity (`fantasy.shop.oddity`), haggle (`fantasy.shop.haggle`)                                                | `{name}, {kind\|a}`        |
| `fantasy.rumor`          | text (`fantasy.rumor.text`), truth (`fantasy.rumor.truth`), source (`fantasy.rumor.source`)                                                                                                                                                                  | `{text\|cap}`              |
| `fantasy.secret`         | text (`fantasy.secret.text`)                                                                                                                                                                                                                                 | `{text\|cap}`              |
| `fantasy.clue`           | delivery (`fantasy.clue.delivery`), trace (`fantasy.clue.trace`), where (`fantasy.clue.where`)                                                                                                                                                               | `{delivery\|cap}: {trace}` |
| `fantasy.complication`   | trouble (`fantasy.complication.trouble`), twist (`fantasy.complication.twist`)                                                                                                                                                                               | `{trouble\|cap}`           |
| `fantasy.trinket`        | item (`fantasy.trinket.item`), detail (`fantasy.trinket.detail`)                                                                                                                                                                                             | `{item\|cap}`              |
| `fantasy.treasure`       | item (`fantasy.treasure.item`), worth (`fantasy.treasure.worth`), hook (`fantasy.treasure.hook`)                                                                                                                                                             | `{item\|cap}`              |
| `fantasy.seed`           | a, b (`situation`, b `distinctFrom: a`), enemy (facet of a), friend (facet of b), complication (facet of b), thing (facet of a), place (facet of b), pressure (facet of a)                                                                                   | `{a} meets {b}`            |
| `fantasy.encounter`      | question (`fantasy.encounter.question`), opposition (`.opposition`), goal (`.goal`), terrain (`.terrain`), turn (`.turn`), failForward (`.fail`)                                                                                                             | `{question\|cap}`          |
| `fantasy.prep.spotlight` | hook (`fantasy.prep.spotlight`)                                                                                                                                                                                                                              | `{hook\|cap}`              |
| `fantasy.prep.pressure`  | rumor (`fantasy.prep.pressure-rumor`), turn (`fantasy.complication.twist`)                                                                                                                                                                                   | `{rumor\|cap}`             |

Table entries may themselves contain name slots (for example `fantasy.shop.name` entries such as `{name:family}'s {fantasy.shop.noun}`), because those are fresh culture names, not field references.

### 4.4 Tables and target entry counts (S1b)

Counts are minimums. "Pocket-feeding" tables must keep at least **12 eligible entries** under the strict-lines fixture (§4.6).

| Area            | Tables (entries)                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Place           | `place.word-a` (30), `place.word-b` (30), `place.name` (10 patterns over the word tables), `place.kind` (30), `place.sight` (40), `place.sound` (40), `place.smell` (40), `place.happening` (30) |
| Settlement      | `settlement.name` (10 patterns), `settlement.size` (6, weighted toward village), `settlement.known-for` (30), `settlement.trouble` (30), `settlement.power` (24)                                 |
| Tavern          | `tavern.name` (8 patterns), `tavern.adj` (30), `tavern.noun` (30), `tavern.keeper-way` (24), `tavern.menu` (30), `tavern.regular` (30)                                                           |
| Shop            | `shop.name` (8 patterns), `shop.noun` (20), `shop.kind` (24), `shop.ware` (60), `shop.oddity` (24), `shop.haggle` (20)                                                                           |
| Rumor           | `rumor.text` (40), `rumor.truth` (3: "true" ×2, "half true: the details are wrong" ×2, "false, but someone wants it believed" ×1), `rumor.source` (24)                                           |
| Secret and clue | `secret.text` (40), `clue.delivery` (24), `clue.trace` (40), `clue.where` (24)                                                                                                                   |
| Complication    | `complication.trouble` (40), `complication.twist` (30)                                                                                                                                           |
| Loot            | `trinket.item` (50), `trinket.detail` (30), `treasure.item` (40), `treasure.worth` (12, system-neutral: "worth a month's wages"), `treasure.hook` (24)                                           |
| Encounter       | `encounter.question` (30), `.opposition` (30), `.goal` (24), `.terrain` (30), `.turn` (24), `.fail` (24)                                                                                         |
| Situations      | 20 situations × 6 facets × 4 entries                                                                                                                                                             |
| Prep            | `prep.spotlight` (24), `prep.return` (16), `prep.villain-move` (30), `prep.pressure-rumor` (24)                                                                                                  |
| Oracle          | `meaning.action` and `meaning.theme` grow from 30 to 50 words each                                                                                                                               |
| Moves (core)    | `core.gm-moves` grows from 12 to 24 cards, each with `safety` tags (P0 schema)                                                                                                                   |
| Cultures        | the existing 3 (Marsh-folk, Highland, Imperial coast), each raised to 16 curated examples and 4 voice tips (D41)                                                                                 |

**Vocabulary additions** (`vocabulary.yaml`): `place`, `settlement`, `tavern`, `shop`, `rumor`, `secret`, `clue`, `complication`, `loot`, `encounter`, `situation`, `river`, `forest`, `mountain`, `underground`, `ruin`, `road`.

### 4.5 Writing rules (added to `CONTRIBUTING.md` in S1)

- The existing rules still apply: one breath, specific, playable, fits the slot, original only, CC-BY-4.0.
- **Slot grammar.** Each table's `title` states the sentence it completes, for example "Rumor: People say that …". Entries are written to read aloud after that stem.
- **Safety:** every entry touching a vocabulary topic carries its tag. When unsure, tag it. At most about 30% of the entries in any table carry safety tags.
- **No duplicates in spirit** within a table or across `rumor.text` and `secret.text`.
- **Names and voice notes** (D11). Culture `examples` and voice `tips` must not touch any safety topic. A new lint rule, `culture-safety`, rejects examples and tips that contain words from a short per-topic stem list in `packages/engine/src/safetyStems.ts`. `banned` regexes catch unfortunate syllables. Generated names carry no safety tags.

### 4.6 S1 tests and acceptance

1. Engine unit tests for situations:
   - `situation` respects lines (a lined situation is never chosen in 10,000 rolls), veils (the card's `flags.veiled` includes the situation's tags) and `distinctFrom` (a ≠ b in 10,000 rolls);
   - `facet` follows `of`, and a blocked `of` gives a blocked facet;
   - topological order works, and a cycle is a lint error;
   - every new lint rule has a failing fixture (R2: inline docs in engine tests, YAML dirs in the CLI test).
2. **The I3 generation-level safety property test is extended:** its fixture gains a situation, a seed-like generator with `situation` and `facet` fields, and locked facet fields. The test runs 10,000 generations, and the new mutations it must kill include a facet that bypasses `selectEntry` and a `distinctFrom` that ignores lines.
3. **Determinism snapshots:** one per new generator at seed `TEST-0001` with an empty context.
4. **Content tests** in `packages/engine/test/packs.test.ts`:
   - every generator generates 1,000 times with no thrown error, no `[missing` text and no empty field;
   - under the **strict-lines fixture** (`violence, death, fire, drowning, religion, spiders, insects, rats, war`), every Pocket-feeding table keeps at least 12 eligible entries, and no table loses more than 40%.
5. `pnpm content:lint` is clean, coverage stays ≥ 90%, and the benchmark still shows a batch of 60 under 25 ms in CI.
6. A reviewer signs off originality and tagging for the full content (S1b) in the slice review.

---

## 5. Slice S2: persistence and Codex

### 5.1 Database (`apps/web/src/data/db.ts`)

Dexie database `prepdesk`, **schema version 1**:

```ts
db.version(1).stores({
  campaigns: 'id, updatedAt',
  sessions: 'id, campaignId, [campaignId+number], status',
  entities: 'id, campaignId, [campaignId+kind], [campaignId+updatedAt], *tokens',
  links: 'id, campaignId, fromId, toId, [fromId+rel]',
  ledger: 'id, sessionId, campaignId, [sessionId+at], entityId',
  shortlist: 'id, campaignId, [campaignId+status], entityId',
  usedNames: '[campaignId+nameKey], campaignId, [campaignId+at]',
  pocket: 'id, sessionId, [sessionId+section]',
  drafts: 'id, sessionId, [sessionId+step], status',
  prepAnswers: '[sessionId+step], sessionId',
  settings: 'key',
});
```

**Ids** come from `data/ids.ts → newId(prefix)`: a prefix plus 16 Crockford characters from `crypto.getRandomValues` (no secure-context dependency, matching M4). The prefixes are `cmp_`, `ses_`, `ent_`, `lnk_`, `evt_`, `sho_`, `poc_`, `drf_`. All timestamps are `Date.now()` milliseconds.

### 5.2 Entity model (`data/schema.ts`)

```ts
type Safety = { lines: string[]; veils: string[] };

interface Campaign {
  id: string;
  name: string;
  genre: 'fantasy';
  safety: Safety; // default { lines: ['child-harm'], veils: [] }
  cultureIds: string[]; // Pocket name cultures; default all 3, min 1
  createdAt: number;
  updatedAt: number;
  lastExportedAt?: number;
}

type SessionStatus = 'prepping' | 'ready' | 'live' | 'wrapping' | 'done';
interface Session {
  id: string;
  campaignId: string;
  number: number;
  status: SessionStatus;
  prepStep: 1 | 2 | 3 | 4 | 5 | 6;
  stepsVisited: number[];
  stepsSkipped: number[];
  prepElapsedMs: number;
  presentPcIds: string[];
  spotlightPcIds: string[];
  plannedTicks: Record<string, number>; // frontId → ticks to apply at start (D19)
  sceneOrder: string[];
  currentSceneId?: string;
  focusEntityId?: string;
  pocketSeed: string;
  pocketRolledAt?: number;
  startedAt?: number;
  pausedAt?: number;
  pausedMs: number;
  endedAt?: number;
  recap: string;
  recapSavedAt?: number;
  createdAt: number;
  updatedAt: number;
}

type EntityKind =
  'pc' | 'npc' | 'place' | 'front' | 'truth' | 'clue' | 'scene' | 'thread' | 'item' | 'note';
interface Entity {
  id: string;
  campaignId: string;
  kind: EntityKind;
  subtype?: string; // place: settlement|tavern|shop|location · item: trinket|treasure
  // note: rumor|complication|encounter|seed|detail · scene: strong-start|scene
  title: string;
  aliases: string[];
  summary: string;
  fields: Record<string, string>; // authoritative, editable (D4)
  body: string; // plain text with [[wiki links]]
  canon: 'provisional' | 'kept'; // D7
  state?: string; // clue: hidden|found · truth: open|revealed · front: active|resolved
  // scene: planned|played|skipped · thread: open|closed
  clock?: { size: 4 | 6 | 8; filled: number; doom: string }; // fronts
  card?: string; // serializeCard JSON, provenance only
  veiled: string[]; // veil tags from the origin card
  origin: 'prep' | 'table' | 'manual' | 'import';
  firstSessionId?: string;
  lastSessionId?: string;
  tokens: string[]; // search tokens, derived on every write
  createdAt: number;
  updatedAt: number;
}

type LinkRel = 'mentions' | 'points-to' | 'at' | 'part-of' | 'knows';
interface Link {
  id: string;
  campaignId: string;
  fromId: string;
  toId: string;
  rel: LinkRel;
  origin: 'wiki' | 'explicit';
  createdAt: number;
}

interface UsedName {
  campaignId: string;
  nameKey: string /* normalizeName */;
  name: string;
  cultureId: string;
  sessionId: string;
  entityId?: string;
  at: number;
}

interface PocketItem {
  id: string;
  sessionId: string;
  campaignId: string;
  section: 'names' | 'npcs' | 'places' | 'rumors' | 'loot' | 'twists';
  order: number;
  locked: boolean;
  card?: string; // serialized Card
  name?: { name: string; cultureId: string }; // names section
  usedAt?: number;
  usedNote?: string;
  entityId?: string;
}

interface Draft {
  id: string;
  sessionId: string;
  step: number;
  kind: string /* rumor|clue|scene|… */;
  line: string;
  card?: string;
  status: 'draft' | 'kept' | 'tossed';
  entityId?: string;
  order: number;
}

interface PrepAnswer {
  sessionId: string;
  step: number;
  answers: Record<string, string>;
  updatedAt: number;
}

interface ShortlistItem {
  id: string;
  campaignId: string;
  fromSessionId: string;
  entityId?: string;
  card?: string; // one of the two
  label: string; // "Improvised NPC", "Improvised detail", "Clue not found", …
  title: string;
  question: string;
  yesLabel: string; // e.g. "Yes, flesh out", "Make NPC", "Move it"
  status: 'open' | 'fleshed' | 'let-go';
  deferrals: number;
  createdAt: number;
  decidedAt?: number;
}
```

- **Truths and clues** (D6): a `truth` is something the players could work out. A `clue` is one way to learn it, linked `clue --points-to--> truth`. A clue can also be linked `clue --at--> place|scene` ("Hidden: Clue 4, a ledger page nailed under the bar").
- **Avoid-names feed:** `avoidNames` = the given names of the campaign's 200 most recent `usedNames` (newest first) plus every NPC entity title not already listed. The engine guard uses the last 8 of these for first letters (foundations §4.8).

### 5.3 Ledger events

```ts
type LedgerKind =
  | 'session-start'
  | 'strong-start'
  | 'scene'
  | 'npc-improvised'
  | 'npc-used'
  | 'place-improvised'
  | 'place-used'
  | 'rumor'
  | 'clue-found'
  | 'complication'
  | 'item-given'
  | 'encounter'
  | 'oracle'
  | 'move'
  | 'stuck'
  | 'clock'
  | 'note'
  | 'session-end';

interface LedgerEvent {
  id: string;
  campaignId: string;
  sessionId: string;
  at: number; // wall clock
  t: number; // active session ms at the event (timer, D20)
  kind: LedgerKind;
  text: string; // human line, e.g. "Odrin Vey, ferryman (name from Pocket)"
  entityId?: string;
  review: 'none' | 'ask' | 'done';
  undo: UndoPayload; // what to revert (D9)
}

interface UndoPayload {
  createdEntityIds?: string[];
  createdLinkIds?: string[];
  createdShortlistIds?: string[];
  usedNameKeys?: string[];
  usedPocketIds?: string[];
  clock?: { entityId: string; from: number };
  state?: { entityId: string; from: string };
  scene?: { from?: string };
}
```

These kinds start with `review: 'ask'` ("recurring? ask me after"): `npc-improvised`, `place-improvised`, `item-given`, and `note` when the DM ticks **Ask me after**. Every other kind starts with `none`.

### 5.4 Promoting generator cards into entities

`data/repo/entities.ts → entityFromCard(card, kind, opts)` maps card fields to entity fields one to one. The title rule:

- npc and place: the `name` field;
- note, item and clue: the display line;
- truth and scene: the DM's text when present, otherwise the display line.

The summary rule:

- npc: the role;
- place: the kind;
- everything else: the display line.

The card is stored with `serializeCard` in `entity.card`, and `veiled` is copied from `card.flags.veiled`. **From then on the entity's fields are the record** (D4). Edits change `fields`, never the card. If the app ever loads a stored card whose sources now hit a line, the Codex shows "Part of this came from a table that touches one of your lines (spiders)." It never rewrites what the DM kept (D12).

### 5.5 Wiki links

- Syntax: `[[Title]]` or `[[Title|shown text]]`, in `body` and in any text field.
- **On save,** `WikiText.parse` resolves each target by title, then by alias (case-insensitive and diacritic-insensitive) within the campaign. It replaces that entity's `origin: 'wiki'` links with fresh `mentions` links in one transaction.
- **Rendering:** a resolved link is a pencil link to the entry. An unresolved link is a dashed key reading **Create "Title"**, which opens the create slide-over with the title filled in.
- **Renaming** an entity rewrites `[[Old]]` to `[[New]]` in the bodies and fields of every entity that `mentions` it, in the same transaction (D47). The old title is added to `aliases`.

### 5.6 Universal search: "Pull anything" (D22, D23)

- **Scope:** every entity of the current campaign (including provisional ones), **tonight's Pocket items** when a session is live or ready, and **commands** (Roll a name, Roll an NPC, Roll a place, Roll a tavern, Roll a shop, Roll a settlement, Roll a twist, Roll treasure, Roll a trinket, Roll an encounter, Roll a seed, Ask the oracle, Draw a move, I'm stuck). Ledger text is not indexed. It is reached through an entity's History tab.
- **Index** (`data/search.ts`):
  - **Tokenising:** text is NFKD-folded, lowercased and split on anything that isn't a letter or digit.
  - **Tokens indexed:** title, aliases, summary, field values and `kind` labels. Stored as `entity.tokens` (a Dexie multi-entry index) and also held in memory for ranking.
  - **Scoring:** exact title 100, title prefix 60, alias 50, title token prefix 40, field token prefix 10, plus 5 for recently updated. Commands match by verb or noun prefix.
- **Results:** at most 20, grouped Pocket → Codex → Commands, each row showing kind and summary.
  - **Enter on an entity or Pocket item in Table Mode** shows it in the Spread's focus slot as a **peek**, which writes no Ledger line, because looking something up isn't using it. The focus card then offers **Bring in**, which logs `npc-used` or `place-used` for a Codex entity, or the Pocket item's own use action.
  - **Elsewhere,** Enter opens the entity's Detail page.
  - **On a command,** Enter opens the Dock tray.
- **Budget:** ≤ 50 ms per keystroke with 5,000 entities on the reference device. It is tested with a 5,000-entity fixture in jsdom at ≤ 20 ms (CI proxy).

### 5.7 Codex screens

- **`/c/:cid/codex`, List / Index:**
  - **Header:** heading "Codex", the sentence "Everything your campaign knows, linked.", and **Create entry** (opens a slide-over with kind, title and summary).
  - **Toolbar:** search with the visible label "Search the Codex" (`/` focuses it); one **Filters** key with kind, canon (Kept / Provisional), "On the shortlist" and "First seen in session"; and an **Export** icon key (§5.9).
  - **Table:** in an L1 frame with hairlines. Columns are Title (a link), Kind, Summary, Last seen and Status. The default sort is last updated. Pagination is 50 per page and always shown.
- **`/c/:cid/codex/:eid`, Detail / Record:**
  - **Header:** title, the breadcrumb "Codex › Title", a status badge (Kept, Provisional, On the shortlist, Found, Revealed or Resolved) and metadata (kind, first and last session).
  - **Actions:** **Edit** opens a slide-over with per-kind fields and the body. **Bring to the table** appears only while a session is live. The ⋯ menu holds **Delete**, which confirms with "Delete 'Odrin Vey'? Their links and shortlist entry go too. The Ledger keeps its lines."
  - **Tabs:** Details | Connections | History.
- **Connections** is the minimal relationship view (D40): links grouped by relation, with both directions ("Points to", "Pointed to by", "At", "Here", "Part of", "Knows", "Mentions", "Mentioned by"). Each group is a list of linked entries with a remove key. **Add connection** picks a relation and an entry through the Pull anything combobox.
- **History** (Inbox variant B): Ledger events with this `entityId`, or whose text came from it, newest first, with **Load more**.
- **Clocks:** a front's Details tab shows its `Clock` (interactive) and doom text. Edits outside a session are not logged.

### 5.8 Schema versioning and migration policy

- A released `db.version(n)` block is never edited. Every change adds `version(n+1)` with an `.upgrade(tx => …)` that transforms existing rows.
- Every version has a migration test: seed a fake-indexeddb with the previous version's fixture, open the current version, and assert the transformed rows.
- `db.on('versionchange')` closes the connection and shows a Banner: "Prep Desk was updated in another tab. Reload to keep going." with **Reload**.
- An `open()` that stays `blocked` for more than 3 s shows "Close other Prep Desk tabs to finish updating."
- The export format carries `schemaVersion`. Import accepts any `formatVersion` ≤ the current one and upgrades it in code.

### 5.9 Export and restore

**JSON backup** (`data/export/json.ts`). The file is `prepdesk-<campaign-slug>-<yyyy-mm-dd>.json`:

```json
{
  "format": "prepdesk-export",
  "formatVersion": 1,
  "schemaVersion": 1,
  "appVersion": "0.2.0",
  "packs": { "core": "0.2.0", "fantasy": "0.2.0" },
  "exportedAt": 0,
  "campaign": {},
  "sessions": [],
  "entities": [],
  "links": [],
  "ledger": [],
  "shortlist": [],
  "usedNames": [],
  "pocket": [],
  "drafts": [],
  "prepAnswers": []
}
```

**Restore from backup** (Settings → Data, D25) validates the file with zod.

- **Success:** if the campaign id is new, it is added. If the id already exists, a Dialog asks "Replace 'The Salt Marsh Debts' on this device with the backup from 3 Nov?" with **Replace campaign** in stamp red and Cancel as the default. The replace runs in one transaction.
- **Failure:** "That file isn't a Prep Desk backup. Choose a .json file exported from Prep Desk."

**Markdown vault** (`data/export/markdown.ts`, a zip built with `fflate`): `<Campaign name>/` contains:

- `README.md`: an index of sessions and entries by kind, as `[[links]]`;
- `Sessions/Session 07.md`: date, recap, then the Ledger timeline as `- 1:10 · Improvised NPC · [[Odrin Vey]], ferryman`;
- one folder per kind (`PCs/`, `NPCs/`, `Places/`, `Fronts/`, `Truths/`, `Clues/`, `Scenes/`, `Threads/`, `Items/`, `Notes/`), with one file per entity.

Each entity file holds:

- YAML front matter: `id`, `kind`, `subtype`, `canon`, `state`, `first_seen`, `last_seen`, `veiled`;
- `# Title`, then the summary;
- fields as `**Want:** …`;
- the body with links kept;
- `## Connections` as a list of `- Points to: [[…]]`.

Filenames are sanitised (`/\:*?"<>|` removed, at most 80 characters), and duplicates get ` (2)`. Links are rewritten to the final file stem.

**After every successful export,** `campaign.lastExportedAt` is set. Both exports work offline.

### 5.10 S2 tests and acceptance

1. Repository functions run against fake-indexeddb: create campaign (default safety), sessions numbered per campaign, entity CRUD keeps `tokens`, wiki link resolve/rename/unresolved, link groups, `entityFromCard` round trip with `parseCard`.
2. Search ranking cases (exact beats prefix beats field), diacritic folding, the 5,000-entity budget, and command matching.
3. Export: a JSON round trip (export → wipe → restore) gives deep-equal tables. The Markdown zip has the expected paths, front matter and rewritten links (snapshot of a seeded campaign). Duplicate filenames are handled.
4. A migration test harness exists, with a version-1 fixture ready for future versions.
5. Component tests for the Codex list (search, filters, empty state inside the frame, pagination), Detail tabs, edit slide-over, delete confirm (Cancel focused, Escape dismisses) and Connections add/remove.
6. Campaign create, Settings and Home screens (§7.1) ship in S2, because the Codex needs a campaign. They have component tests: default safety, the Fine / Veil / Line control, blur validation, a submit key that is never disabled, the delete confirm, and Home's first-run empty state.

---

## 6. Slice S3: Table Mode

### 6.1 Page pattern: "Console (live session)", proposed (D13, owner to confirm)

The catalogue has no match. Dashboard (4) forbids editing, Analytics (9) needs a date range and Split Pane (8) is for triage. Table Mode is a **live console**: fixed zones you glance at and act on with one tap while a time-based log grows. Proposed definition:

```
TableBar: identity · timer · [Pull anything … /] · [Oracle] [Moves] [⋯]
┌ Kit zone (fixed) ┬ Focus zone (flex) ┬ Log zone (fixed, collapsible) ┐
│ tabs, ready items │ current scene    │ time-ordered events, newest at │
│ one tap = use     │ focus card       │ the bottom, undo per row       │
│                   │ trackers (clocks)│                                │
├ Action dock: one hero key + up to 7 tiles + one queue key ─────────────┤
```

- **Must:**
  - Every zone has a fixed place, with no free-floating cards (the Cultist Simulator lesson in brief §6).
  - The action dock is within thumb reach and always visible.
  - Every action that shows content to players writes one log entry and offers undo.
  - Search is always visible in the bar and `/` focuses it.
  - Generated results open in a non-modal tray above the dock and never navigate away.
  - The page works with no network.
- **Must not:**
  - KPI tiles;
  - route changes for in-session actions;
  - modal dialogs for anything but ending the session and destructive confirms;
  - nested scroll areas inside a zone, beyond the zone's own single scroll;
  - hover-only actions.
- **Narrow:** the three zones become one, switched by a three-key `Segmented` control under the bar (Pocket | Scene | Ledger, default Scene). The dock keeps the hero key fixed at the left, and the tiles scroll horizontally inside the dock (the one allowed inner region).

### 6.2 Regions mapped from the mockup

**TableBar** (`TableBar.tsx`):

- the wordmark;
- campaign name and "Session 7";
- **SessionTimer**: mono `1:42` plus "elapsed". It is a key: tap to pause (label "Pause timer"), tap again to resume (D20). A paused timer reads "paused" and is announced politely once;
- **PullAnything**: a combobox with the visible text "Pull anything: names, NPCs, clues…" and a `/` hint. Its label on narrow screens is aria-only;
- **Oracle** key and **Moves deck** key;
- the ⋯ menu: **End session**, **Leave table** (back to `/`; the session stays live), **Hide ledger** / **Show ledger**, **Safety settings** (§6.11), **Keyboard shortcuts**, **Theme**, and **Update after the session** when an update is waiting (§6.10).

**Pocket** (left, `Pocket.tsx`):

- The header reads "Tonight's Pocket" with the note "rolled Tue, 9pm".
- `Tabs` hold **Names · NPCs · Places · Rumors · Loot** (D16).
- **Names** are grouped by culture. Each group has the culture name, its voice summary as a `MarginNote`, and up to 6 names. A name is a key (`aria-pressed` once used). **Tap = use** (§6.4): the name gets the `Highlight struck` mark, and a one-line "Who is this?" field appears inline in the same row box, so nothing shifts. The field is optional. Enter saves it as `usedNote` and as the entity summary ("→ the ferryman"), and Escape skips. The used row offers **Open card**, which brings the provisional NPC into the focus slot.
- **NPCs:** 6 compact cards (display line plus voice). **Bring in** uses one and opens it in the focus slot.
- **Places:** 4 cards (a tavern, a shop and 2 locations). **Set as scene** uses one and makes it the current scene. **Bring in** puts it in the focus slot only.
- **Rumors:** 6 rumors, each with its truth label as text ("true", "half true", "false"), never colour alone. **Share** uses one.
- **Loot:** 3 treasure and 3 trinkets. **Give** uses one.
- Every item has a `LockToggle`. The footer key is **Reroll the unused ones**, which rerolls unlocked, unused items with an inline undo for 8 s.

**Spread** (centre, `Spread.tsx`), stacked top to bottom:

1. **SceneCard** (ruled card):
   - an eyebrow "Scene · {subtype} · {settlement or place}";
   - the scene title;
   - an optional margin note from `fields.note` ("they'll want a boat →");
   - **Sight / Sound / Smell** from the linked place, or from the scene's own fields;
   - **Who's here**: chips of `at`-linked NPCs, plus a **+ Add** key that opens Pull anything filtered to NPCs, with **Roll an NPC** as the last row;
   - **Hidden**: chips for clues `at` this scene or place with state `hidden`. Tapping one opens **Mark found** (§6.4).
   - The header key **Next scene** opens a Popover listing the session's `sceneOrder` (planned scenes first, played ones struck), with **New scene from a place**.
2. **FocusCard**: the last thing brought in.
   - An NPC shows name, role, Want / Secret / Voice (hand font) / Tell, and the stamp `IMPROVISED · S7` for provisional entities. The stamp reads `S{session.number}`.
   - Actions are **Pin to scene** (adds an `at` link to the current scene) and **Flesh out later** (adds a ShortlistItem). Close is an IconButton. A peeked card (§5.6) shows **Bring in** first. Pin to scene on a peeked card also brings it in.
   - With nothing focused, it shows "Brought-in cards land here."
3. **FrontCard**: the campaign's active fronts, one at a time, with ‹ › keys when there are several.
   - It shows "Front · {title}", the portent line, `Clock` and the doom line "at 6: {doom}".
   - **Tick +1** logs `clock` "The Tide Rises 2 → 3". At full, the stamp `FULL` appears and the text reads "The Tide Rises is full: {doom}".
   - **Tick −1** lives in the card's ⋯ menu and also logs, so the record stays honest.

**Ledger** (right, `Ledger.tsx`, `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`):

- The header reads "Ledger · auto-logged".
- Rows are chronological with the newest at the bottom (D49). The list auto-scrolls to new rows unless the DM has scrolled up, in which case a **Jump to latest** key appears.
- Each row shows `t` (mono), the kind label (text, plus a colour token), the text, and for `review: 'ask'` the margin note "recurring? ask me after".
- **Undo** appears inline on a new row for 8 s. After that it stays available in the row's ⋯ menu along with **Edit text**.
- The footer has an **Add a note** field: Enter logs `note`. A small **Ask me after** toggle sits beside it.
- Below the note field, "{n} things to review after the game →" is a key that opens the End session dialog.
- Only the last 200 rows are rendered, with **Show earlier**.

**Dock** (bottom, `Dock.tsx`):

- **Stuck?** is a `Button lg` with the stamp edge, captioned "move + twist + prompt". Then come `DockButton`s: **Name, NPC, Place, Twist, Treasure, Encounter**. The mockup's Map tile is left out (D15).
- On the right, **Shortlist · 3**, captioned "for next prep", opens a Popover listing open ShortlistItems from this session, each with **Remove**.
- The dock sits above every zone. The update chip never covers it (§6.10).

### 6.3 Dock trays and generators

Tapping a tile opens the **DockTray** with a fresh card. The seed is `newSeed()`, or the e2e seed (D37). The context is `contextFor(campaign, { settlement })`, where `settlement` is the current scene's settlement when it has one.

| Tile      | Generator                                                                                       | Tray actions                                                |
| --------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Name      | 3 names, one per enabled culture (from `batch`, with `avoidNames`), each with its voice summary | Tap a name to use it (same as the Pocket) · **Roll 3 more** |
| NPC       | `fantasy.npc`                                                                                   | **Use it** · **Pin to scene** · **Flesh out later**         |
| Place     | `fantasy.place`. A key row inside the tray switches to Tavern, Shop or Settlement               | **Set as scene** · **Use it** · **Flesh out later**         |
| Twist     | Tonight's next unused `twists` Pocket item, else a fresh `fantasy.complication`                 | **Use it** · **Flesh out later**                            |
| Treasure  | `fantasy.treasure`. The key row switches to Trinket                                             | **Give** · **Flesh out later**                              |
| Encounter | `fantasy.encounter`                                                                             | **Use it** · **Flesh out later**                            |

- Every card shows `CardFields` with a `LockToggle` per field and a **Reroll** key, which calls `reroll` on the unlocked fields. Only one tray is open at a time. Opening another tile replaces the card, and the replaced card is discarded with no log entry.
- **Use it** creates a provisional entity, logs the event, puts the card in the focus slot and closes the tray.
- **Pin to scene** does the same and adds an `at` link to the current scene.
- **Flesh out later** saves a `ShortlistItem` with `card` and **no entity**, because nothing was used in play (D48). It writes no Ledger event, and the dock count goes up.

### 6.4 "Use = log"

`features/table/actions.ts` has one function per action. Each runs **one Dexie transaction** that writes the content change and its `LedgerEvent` (with its `UndoPayload`) together.

| Action                         | Writes                                                                                                                                                          | Ledger kind and text                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Use a Pocket or Dock name      | provisional npc entity (title = name, `fields.culture`, `fields.voice`), usedNames row, pocket `usedAt`/`entityId`                                              | `npc-improvised` "Odrin Vey (name from Pocket)", ask. The note is appended when saved: ", ferryman" |
| Bring in or use an NPC card    | provisional npc from the card                                                                                                                                   | `npc-improvised` "{display}", ask                                                                   |
| Bring in an existing Codex NPC | `lastSessionId`                                                                                                                                                 | `npc-used` "{title}"                                                                                |
| Use or set a place             | provisional place from the card (subtype from the generator)                                                                                                    | `place-improvised`, ask, or `place-used` for an existing place                                      |
| Set as scene                   | `session.currentSceneId`. A place becomes the scene's `at` target, and a new kept scene entity (subtype `scene`, state played) is created if the place had none | `scene` "Scene: {title}"                                                                            |
| Share a rumor                  | pocket `usedAt`, a kept note (subtype rumor)                                                                                                                    | `rumor` "{text} ({truth})"                                                                          |
| Mark a clue found              | clue `state` hidden → found                                                                                                                                     | `clue-found` "Clue: {title}"                                                                        |
| Use a twist or complication    | pocket `usedAt`                                                                                                                                                 | `complication` "{trouble}"                                                                          |
| Give treasure or a trinket     | provisional item                                                                                                                                                | `item-given` "{item}", ask                                                                          |
| Use an encounter               | kept note (subtype encounter)                                                                                                                                   | `encounter` "{question}"                                                                            |
| Ask the oracle                 | nothing else                                                                                                                                                    | `oracle` "{question or 'Oracle'}: Yes, but… / Abandon · Faith" (D10)                                |
| Draw a move                    | nothing else                                                                                                                                                    | `move` "{move text}" (D10)                                                                          |
| Use Stuck?                     | pocket `usedAt` for its twist                                                                                                                                   | `stuck` "{move} · {trouble} · {word} · {word}"                                                      |
| Tick a clock                   | front `clock.filled`                                                                                                                                            | `clock` "{title} {from} → {to}"                                                                     |
| Add a note                     | nothing else                                                                                                                                                    | `note` "{text}", ask if toggled                                                                     |

- **Provisional vs kept:** only actions whose event starts as `review: 'ask'` create provisional entities (NPCs, places, items), because only those reach the wrap-up triage. Rumors, encounters and scenes used at the table are canon the moment they are used, so they are created kept (D7).
- **Undo** reverts the payload in one transaction and deletes the event (D9).
- **Names stay used** even after Let go in wrap-up. They were said out loud, so `usedNames` keeps them and the Pocket never offers them again.
- Each used name and NPC card also adds its name to the session's in-memory avoid list, so the next Dock name tray avoids it at once.

### 6.5 Tonight's Pocket: generation rules

`buildPocket(lib, campaign, session, codex)` in `pocket.ts` is pure and deterministic for `session.pocketSeed`. It runs when prep step 6 opens, or at **Start session** if no Pocket exists (D32).

| Section | Contents                                                                                                                                             | Call                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| names   | 6 per enabled culture (18 with 3 cultures), grouped by culture, with the culture's voice summary                                                     | one `batch` per culture: `{ cultureId, count: 6 }`, seed `${pocketSeed}:names:${cultureId}`, context `cultureId` |
| npcs    | 6, spread round-robin across the enabled cultures                                                                                                    | one `batch` per culture with that culture's share                                                                |
| places  | 1 `fantasy.tavern`, 1 `fantasy.shop`, 2 `fantasy.place`, with `ctx.settlement.name` from the campaign's most recently used settlement entity, if any | one `batch`                                                                                                      |
| rumors  | 6 `fantasy.rumor`. Rumor _i_ gets `ctx.front.name` = active front _i_ mod the front count, when there are fronts                                     | 6 `generate` calls, seed `${pocketSeed}:rumor:${i}`                                                              |
| loot    | 3 `fantasy.treasure`, 3 `fantasy.trinket`                                                                                                            | one `batch`                                                                                                      |
| twists  | 6 `fantasy.complication`. They are not a Table tab; they feed Twist and Stuck? and are shown in prep step 6                                          | one `batch`                                                                                                      |

- The total is 46 results, under the 60-result budget.
- The **distinctiveness guard:** each batch receives `avoidNames` (§5.2) plus every name already produced by earlier batches in this build, so names never repeat across sections, and first letters spread out.
- **Locked items survive** "Reroll the unused ones". Cards go through `reroll`, which bumps unlocked fields. Names are replaced by a new `batch` seeded with `${pocketSeed}:names:${cultureId}:${rerollCount}`.
- **Unused items do not carry over.** The next session builds a fresh Pocket, and the shortlist is the carry-over path.

### 6.6 Stuck?

**Stuck?** opens the tray with three parts, each with its own reroll key:

1. **Move:** `drawMove(lib, 'core.gm-moves', { exclude: movesDrawnThisSession, safety })`, showing text and prompt.
2. **Twist:** the next unused `twists` Pocket item (`trouble` plus `twist`), else a fresh `fantasy.complication`.
3. **Prompt:** two meaning words from `rollTable` on `fantasy.meaning.action` and `fantasy.meaning.theme` with the campaign safety, for example "Abandon · Faith".

**Use this** logs `stuck` (D17). Closing without using logs nothing.

### 6.7 Oracle and moves

- **Oracle Popover:** an optional question field (hand font, label "Your question (optional)") and the likelihoods as a `Segmented` control: Certain · Likely · Even · Unlikely · Remote, defaulting to Even. **Ask** calls `askOracle(lib, 'fantasy.oracle', likelihood, { safety })`. The result shows **Yes** or **No** in display type, "and…" or "but…" as words, and the meaning pair. A blocked word shows `—` with "hidden by your lines". It is logged on reveal (D10). **Ask again** keeps the question.
- **Moves Popover:** **Draw a move** shows text and prompt and logs it. **Draw another** excludes the moves drawn this session (it cycles once the deck is exhausted).

### 6.8 Scenes, clocks and the session lifecycle

- **Start session** (from Home, the end of prep or `/table`) runs in one transaction:
  1. set `status: 'live'` and `startedAt`;
  2. build the Pocket if it is missing;
  3. apply `plannedTicks`, each logged as `clock` "{title} {from} → {to} (planned in prep)";
  4. set `currentSceneId` to the strong-start scene if there is one and log `strong-start`;
  5. log `session-start`.
- Only one session per campaign can be live. Opening `/table` for a campaign with a live session resumes it.
- **End session:** a Dialog asks "End Session 7? The timer stops and the wrap-up opens." with **End session** and **Keep playing**. It sets `endedAt` and `status: 'wrapping'`, logs `session-end`, and navigates to the wrap-up.
- **Scenes** are entities of kind `scene`: `fields.note`, an optional `at` link to a place, and `state` planned → played (set when it becomes current) → skipped (set in wrap-up if never played).

### 6.9 Offline guarantees and performance budget

**Offline:**

- The Workbox precache already globs js/css/html/woff2/json/svg/png. S3 adds a CI check (`scripts/check-precache.mjs`): every emitted chunk of the build appears in the generated precache manifest. Route components for Table Mode are **not** lazy-loaded.
- Nothing in Table Mode makes a network request. e2e J2 enforces this by failing on any request other than navigation and service-worker requests after going offline.

**Budgets.** The reference device is a mid-range tablet, about an iPad 9th gen or Galaxy Tab A8. The CI proxy is Playwright Chromium with 4× CPU throttle.

| Measure                                      | Device budget                    | CI check                                     |
| -------------------------------------------- | -------------------------------- | -------------------------------------------- |
| Table route interactive, warm service worker | ≤ 1.5 s                          | ≤ 2.5 s under throttle (reported, soft-fail) |
| Dock tile → tray card visible                | ≤ 100 ms                         | ≤ 200 ms under throttle                      |
| Use → Ledger row visible                     | ≤ 100 ms                         | ≤ 200 ms under throttle                      |
| `buildPocket` (46 results)                   | ≤ 100 ms                         | ≤ 25 ms (Vitest bench)                       |
| Pull anything per keystroke, 5,000 entities  | ≤ 50 ms                          | ≤ 20 ms jsdom bench                          |
| Initial JS (shell + Table), gzip             | ≤ 250 KB, excluding content JSON | build-size check, hard fail                  |
| Content JSON, raw total                      | ≤ 600 KB                         | build-size check, hard fail                  |

The CI timing rows are reported on every run and become hard failures once a baseline exists, like the engine bench.

### 6.10 Update notice during a session (D21)

- vite-plugin-pwa stays at `registerType: 'prompt'`. A waiting service worker never takes over by itself.
- **While a session is live:** `UpdateChip` is not rendered on `/c/:cid/table/:sid`. Instead the ⋯ menu shows **Update after the session**, and the session timer area shows a small pencil dot with the accessible label "Update ready".
- **After End session:** the chip appears on the wrap-up and every other route.
- The P0 key-polish batch added the z-index scale `--z-content: 0`, `--z-dock: 30`, `--z-notice: 40`, `--z-tooltip: 50` and the hook `--dock-clearance` (default `0px`). The update chip already uses `--z-notice` and sits at `bottom: calc(var(--dock-clearance) + …)`. **Table Mode sets `--dock-clearance` to its dock height,** so the chip (after the session) clears the dock. S3 adds `--z-tray: 35` (above the dock, below notices) and `--z-dialog: 60` (above everything) to the same scale. The deferred Task 15 finding is resolved this way.
- A Dexie schema upgrade only happens on reload, so an update never migrates data mid-session.

### 6.11 Safety in Table Mode

- **Every engine call** passes the campaign's `safety`: `generate`, `reroll`, `batch`, `rollTable`, `askOracle`, `drawMove`, and the meaning words.
- **Changing lines or veils** mid-session happens through ⋯ → **Safety settings**, which opens a `SlideOver` with the same `SafetyPicker` as Settings, so the DM never leaves the table. Each change saves instantly and runs `applySafety` on every **unused** generated card: the Pocket, the open tray, drafts and shortlist cards. It writes the results back. Fields change only where a line now applies or where a removed line lets a field return (no reshuffle). Pocket names are untouched, because names carry no safety tags (D11).
- **Used and kept entities are never auto-edited** (D12).
- **A veiled field** shows its text with the margin note "veil: {topic}, fade to black" in pencil, and the card carries a `Veiled` stamp. A blocked field shows `—` and "hidden by your lines". The LOOSENED stamp marks `relaxed` cards.

### 6.12 S3 tests and acceptance

1. Unit tests:
   - `buildPocket`: determinism for a seed, counts, culture grouping, no repeated full name, first-letter spread, locked items survive rerolls, and safety (a lined tag never appears in 200 pockets);
   - every action in §6.4 writes exactly its rows plus one event, and undo restores the previous rows byte for byte;
   - timer arithmetic with pauses;
   - planned ticks applied once.
2. Component tests: Pocket name use (struck, `aria-pressed`, inline note, no layout shift as measured by `getBoundingClientRect`), tray lock/reroll keeping locked values, Stuck? parts reroll independently, oracle blocked word shown as `—`, Ledger undo within 8 s and through the menu, End session dialog focus, and the TableBar timer label.
3. e2e: J1's table portion at all four viewports, J2 offline, J3 safety (§12.3), the update chip absent on a live table route (stubbed `needRefresh`), and 44 px and no-horizontal-scroll checks on the table route.
4. The budgets in §6.9 are reported in CI.

---

## 7. Slice S4: Prep interview, wrap-up and shortlist

§7.1 describes the campaign screens. They are **built in S2**, because the Codex needs a campaign. S3 and S4 fill in the Home tiles that depend on them; until then those tiles read "Not prepped".

### 7.1 Campaign create, settings and Home (built in S2)

- **`/campaigns/new`** (Form, page; about 640 px column):
  - **Campaign name** (required). Blur validation reads "Give the campaign a name, even a working title."
  - **Genre** is read-only text: "Fantasy. More genres come later."
  - **Session zero** has the heading "What's off the table?" and the line "Lines never show up. Veils can happen, but off-screen. You can change these any time, even mid-session." The 25 topics appear in five groups:
    - **Harm and violence:** violence, gore, death, torture, war;
    - **People and bodies:** abuse, child-harm, sexual-content, pregnancy, body-horror, self-harm, suicide;
    - **Mind and society:** addiction, mental-illness, slavery, hate-bigotry, religion, police;
    - **Fears:** insects, spiders, rats, drowning, fire, claustrophobia;
    - **Animals:** animal-harm.
  - Each topic is a `Segmented` control with **Fine · Veil · Line** (D39). `child-harm` starts on Line.
  - The submit key **Create campaign** is never disabled (forms rule).
  - On success: `navigator.storage.persist()` is requested (D36), the campaign becomes current, and the app navigates to `/`.
- **`/c/:cid/settings`** (Settings) has sections Campaign (name), Safety (the same control, saving instantly), Cultures (a toggle per culture, at least one), Data and Danger zone.
  - **Data:** export JSON, export Markdown, restore from backup, the storage status "Saved on this device. Protected from browser clean-up: yes / not yet", **Ask the browser to keep it** (calls `persist()`), and on iOS Safari outside standalone mode, the tip "Add Prep Desk to your Home Screen so Safari doesn't clear it."
  - **Danger zone:** **Delete campaign**, confirmed with "Delete 'The Salt Marsh Debts' and all 7 sessions from this device? Export a backup first if you might want it back."
- **`/`** (Dashboard):
  - The heading is the campaign name, with the sentence "Session 8 is next."
  - Up to five tiles: Next session (Not prepped / Prep 3 of 6 / Ready / Live now), Shortlist (3 waiting), Fronts (2 active), Last backup ("12 days ago" or "Never"), and Codex (48 entries).
  - Link-out keys: **Start prep for Session 8** or **Continue prep**, **Open the table** ("No prep? The Pocket rolls itself."), and **Open the Codex**.
  - The supporting list shows the last 5 sessions with their recaps' first line.
  - With no campaign, it shows the first-run empty state (§8.3).

### 7.2 Prep interview layout (from the PrepDesk mockup)

- **FocusBar:** "Prepping Session 8 · The Salt Marsh Debts · 14 min in · about 16 to go · **Save and finish later**".
- **StepRail** (left; on narrow screens a "Step 3 of 6" key that opens the list):
  - six rows with number, title and subtitle;
  - done rows show a check, the current row has the pencil border, and skipped rows read "skipped";
  - any row is reachable at any time;
  - under the rail: "Six steps, about five minutes each. Skip any of them; the Pocket fills the gaps."
- **Main column:**
  - the eyebrow "Step 3 of 6 · The Pressure";
  - **the question** as an h1 (display font);
  - **why we ask** as body text in muted ink;
  - the answer `Field`: hand font, a textarea labelled "Your answer: a sentence or two is plenty";
  - **Need a nudge?** chips (keys);
  - "From your answer, the desk drafted:" followed by `DraftCard`s with **Keep · Edit · Toss**.
- **Sticky footer:** **Back**, a hint line (for example "clock will tick to 4 at the start of the game"), **Skip this step**, and **Next: The Opening**. On step 6 the last key is **Finish prep**.
- **Shortlist panel** (right; on narrow screens a "Shortlist (3)" key opening a slide-over): "From Session 7. Decide now or later." Each item has its label, title and question, plus **{yesLabel}** · **Later** · **Let go**.

**Drafting rules, no AI (D30).** The desk never claims to understand an answer. `drafting.ts` does three things:

1. **Mentions:** it finds Codex titles and aliases, and front titles, that appear in the answer (a whole-word, case-insensitive, diacritic-folded match, longest first). The first mentioned NPC or place becomes `ctx.mention.name`, and mentioned entities are linked to the drafts.
2. **The DM's sentence is the core line:** the answer's first sentence, cut at 90 characters on a word boundary, becomes the title of the scene, truth or thread draft.
3. **Tables add texture:** the other fields come from generators with the context. A draft is a card plus its line. **Keep** creates the entity (`canon: 'kept'`, `origin: 'prep'`) at once. **Edit** turns the line into an in-place input in the same box (Enter keeps it, Escape cancels). **Toss** hides the draft with an inline **Undo**. Every draft also has **Reroll** for its generated fields.

Answers autosave 800 ms after the last keystroke and on blur. They are never lost by navigating away.

### 7.3 The six steps

Each step has a soft budget of 5 minutes. After 5 minutes on one step, a margin note reads "Five minutes is plenty here. The Pocket covers the rest." Nothing blocks.

**Step 1: The Table** (subtitle "who's coming, whose spotlight")

- **Question:** "Who's at the table tonight, and whose character hasn't had a moment lately?"
- **Why we ask:** "Prep for the people, not the plot. One hook aimed at one character is worth more than a page of lore."
- **Answer:** the free-text field, plus a PC roster.
  - Each PC row has a present toggle, a **Spotlight** toggle (aim for 1–2) and a one-line field "What do they want right now?", prefilled from last time.
  - **Add a character** takes a name and an optional player name.
  - In Session 1 the roster starts empty and the hint reads "Add each character. You'll only do this once."
- **Nudges:** **Roll a want** (fills an empty want from `fantasy.npc.want`), **Pull a thread from last time** (lists open threads), **Ask the player at the start** (adds a note to the strong start: "Ask {pc}: what are you hoping happens tonight?").
- **Drafts:** one **Spotlight hook** per spotlit PC (`fantasy.prep.spotlight`, with `ctx.pc.name` and `ctx.pc.want`), for example "someone from Mara's past turns up needing exactly what she wants". Kept, it becomes a `scene` (subtype scene, state planned) appended to `sceneOrder`, linked `mentions` → the PC.
- **Persisted:** `pc` entities (`fields.want`, `fields.player`), `presentPcIds`, `spotlightPcIds`, `prepAnswers` step 1 and the drafts.
- **Budget:** about 4 minutes.

**Step 2: Last Time** (subtitle "what stuck, what changed")

- **Question (Session 2 onward):** "What did the players care about most last time?"
- **Why we ask:** "Players tell you what the campaign is about by what they chase. Follow that, and let the rest go quiet."
- **Shown above the answer:**
  - last session's recap (editable in place);
  - open threads with a "still open" toggle;
  - unfound clues from the last session with **Move it** (pick a place or scene to link `at`) or **Leave it**.
  - The Shortlist panel is open by default on this step.
- **Nudges:** **Show the recap**, **Use something from the shortlist**, **Bring someone back** (lists NPCs seen last session).
- **Drafts:**
  - a **Thread** from the answer's first sentence, kept as a `thread` (state open);
  - for each mentioned NPC, a **Comes back** scene from `fantasy.prep.return` (for example "{ctx.mention.name} turns up with news nobody wanted").
- **Session 1 variant (D31):**
  - **Question:** "What do the players already know when the game begins?"
  - **Why we ask:** "A shared starting point saves twenty minutes of questions at the table."
  - **Drafts:** one **Thread** per line of the answer.
- **Persisted:** threads, thread states, clue `at` moves, shortlist decisions and the recap edit.
- **Budget:** about 5 minutes.

**Step 3: The Pressure** (subtitle "what the villains do")

- **Question:** "If nobody gets in their way, what does {front} do this week?"
  - With more than one active front, front chips above the question switch which front is being answered. Each front has its own answer key in `prepAnswers.answers[frontId]`.
  - With no fronts, the question becomes "What trouble is moving in the background, whether or not the players look at it?" Answering creates a front: title from the first mention or the first four words, doom from the answer, clock 6.
- **Why we ask:** "Villains act off-screen. One concrete move gives you a rumor, a clue and a scene for free. Their clock is at 3 of 6."
- **Nudges:**
  - **Roll a villain move** (`fantasy.prep.villain-move`, offered as a suggestion line the DM can tap to insert);
  - **Show their clock** (an inline `Clock` plus a −/+ planned-tick stepper, writing `plannedTicks[frontId]` and the footer hint "clock will tick to 4 at the start of the game");
  - **Roll a situation pair** (`fantasy.seed`; its `pressure` and `enemy` can be inserted);
  - **Use something from the shortlist**.
- **Drafts (three per answer):**
  - **Rumor** (`fantasy.prep.pressure` with `ctx.front.name` and `ctx.mention.name`), kept as a note (subtype rumor);
  - **Clue** (`fantasy.clue` with `ctx.truth.text` = the answer), kept as a `clue` plus a `truth` titled "{front}: {first sentence}", linked `points-to`;
  - **Scene** with title = the first sentence, `fields.note` from the draft's twist, and `at` → the first mentioned place.
- **Persisted:** front clock plans, drafts and kept entities.
- **Budget:** about 6 minutes.

**Step 4: The Opening** (subtitle "first scene, in motion")

- **Question:** "Where does the game start, with something already happening?" A second field, labelled "What two to four scenes might happen tonight? One per line. Might, not must.", follows.
- **Why we ask:** "A strong start skips the warm-up. Open on something happening and the players lean in before anyone checks their phone."
- **Nudges:** **Open on the front's move** (inserts the step 3 answer), **Start with a complication** (`fantasy.complication`), **Use a place from the shortlist**.
- **Drafts:**
  - a **Strong start** scene (subtype strong-start). Its title is the answer. Its place is the first mentioned place, else a fresh `fantasy.place` with `ctx.settlement.name`, kept together with the scene as a place (subtype location) and linked `at`. Everything kept in prep is `canon: 'kept'`. Its note is a complication;
  - one **Scene** per line of the second field, built the same way.
- **Persisted:** scenes and `session.sceneOrder` (the strong start first, then the listed order, reorderable with Move up / Move down keys).
- **Budget:** about 5 minutes.

**Step 5: Truths & Places** (subtitle "secrets to find, places to go")

- **Question:** "What could the players learn tonight?" The hint reads "aim for about ten, a sentence each".
- **Second question:** "Where might they go?"
- **Why we ask:** "A secret isn't tied to one place, so it's never lost when the plan changes. Anything they must work out deserves three clues."
- **Answer:** a list editor with one truth per row, an **Add a truth** key and the counter "6 of about 10". Each row has:
  - a **Must learn** toggle;
  - a clue count;
  - **Draft 3 clues** (three `fantasy.clue` drafts with `ctx.truth.text`).
- **The three-clue warning:** when a Must learn truth has fewer than 3 kept clues, the row shows a pencil margin note "Only {n} clue{s} point here. Three is safer." It is a warning, not an error, and Next still works.
- **Places:** a list editor, where each row is the DM's place name. **Roll a place** fills an empty row. Each place drafts a `fantasy.place` card: the DM's text is the title, and the card supplies sight, sound, smell and happening. A clue can be assigned **Hidden at** a place or scene through a picker.
- **Nudges:** **Roll a secret** (`fantasy.secret`), **Pull an unfound clue from last time**, **Roll a place**.
- **Persisted:** `truth` entities (state open, `fields.mustLearn`), `clue` entities with `points-to` and optional `at` links, and `place` entities (subtype location).
- **Budget:** about 7 minutes.

**Step 6: The Pocket** (subtitle "review your improv kit")

- **Question:** "Here's tonight's improv kit. Anything you want to lock or swap?"
- **Why we ask:** "Everything here is ready the moment the table goes quiet. Lock what you like and reroll the rest; nothing unused is wasted."
- **Shown:**
  - `buildPocket` runs on the first visit. The sections Names (by culture, with voice notes), NPCs, Places, Rumors, Loot and Twists each show their items with a `LockToggle` and **Reroll**. **Reroll the unlocked ones** sits at the top;
  - **Add from shortlist** puts a shortlisted card into the matching section as a locked item;
  - a status line: "Works offline" when a service worker controls the page, else "Open Prep Desk once more while online to save it for offline use";
  - a safety summary: "Lines: child-harm, spiders. Veils: gore." with **Change**.
- **Nudges:** none. The Pocket is the nudge.
- **Finish prep** sets `status: 'ready'` and shows two keys: **Start the session** and **Done for now**.
- **Budget:** about 3 minutes.

**Skip, back and save:**

- **Skip this step** records the step in `stepsSkipped`, and the Pocket fills the gap. **Back** is always allowed.
- **Save and finish later** returns to `/`, which offers "Continue prep (step 3 of 6, 14 min in)".
- **The timer** accumulates only while a prep route is visible (`visibilitychange`, D43). "About {30 − elapsed} to go" floors at "a few minutes"; past 30 minutes it reads "{n} min in" only.
- **Mod+Enter** moves to the next step.
- Leaving with an unsaved Edit draft asks "Keep your edit to this card?" with **Keep edit** and **Discard edit** (warn on dirty navigate).

### 7.4 Wrap-up (`/c/:cid/wrap/:sid`, Inbox A, D34)

- **Header:** "Wrap-up · Session 7", with the sentence "Two minutes now saves twenty next week. Decide what stays." Header actions are **Keep the rest** and **Draft the recap**.
- **Tabs:** To review ({n}) | Decided.
- **Rows**, in Ledger order:

  | Source                                                   | Label             | Question                                 | Actions                                            |
  | -------------------------------------------------------- | ----------------- | ---------------------------------------- | -------------------------------------------------- |
  | `npc-improvised`                                         | Improvised NPC    | "{title}. Will they come back?"          | **Keep** · **Shortlist** · **Let go**              |
  | `place-improvised`                                       | Improvised place  | "Will they go back to {title}?"          | Keep · Shortlist · Let go                          |
  | `item-given`                                             | Item given        | "Does {title} matter later?"             | Keep · Shortlist · Let go                          |
  | `note` with Ask me after                                 | Improvised detail | "Make this something real?"              | **Make NPC** · **Shortlist** · **Let go**          |
  | Clues linked to tonight's scenes or places, still hidden | Clue not found    | "Move it somewhere they'll actually go?" | **Shortlist** (as "Move it") · **Leave it hidden** |
  | Scenes in `sceneOrder` still planned                     | Didn't happen     | "Keep {title} for next time?"            | **Keep for next time** · **Let go**                |

- **Effects:**
  - **Keep** sets `canon: 'kept'`.
  - **Shortlist** keeps the entity and adds a ShortlistItem, with label, question and `yesLabel` from the table above ("Yes, flesh out", "Make NPC" or "Move it").
  - **Let go** deletes the provisional entity and its links (the Ledger keeps its text; usedNames keeps the name, D8).
  - **Make NPC** creates an npc from the note text and opens it in a slide-over.
  - **Shortlist** on an "Improvised detail" row first creates a kept note entity (subtype detail) from the event text, then shortlists it with the yesLabel "Make NPC". **Let go** on that row only marks the event decided, because a note has no entity.
  - **Leave it hidden** keeps the clue unchanged.
  - **Keep for next time** leaves the scene in state `planned`. A new session's `sceneOrder` starts with every campaign scene still in state `planned`, oldest first, so kept scenes carry over with no extra marker.
  - **Let go** on a scene marks it `skipped`.
  - Every decision sets the event's `review: 'done'` and shows **Undo** in the row until the page is left.
- **Leaving the wrap-up** with undecided rows: provisional entities stay provisional and appear again on the next wrap-up visit and in the Home tile "3 left to review".
- **Budget:** a typical session yields 5–12 rows at one tap each, plus "Keep the rest", which is about 2 minutes.

### 7.5 Recap draft (`/c/:cid/wrap/:sid/recap`, Form page)

`draftRecap(session, ledger, entities)` in `recap.ts` is pure and deterministic. It joins lists as "A, B and C" and skips any sentence whose list is empty. Let-go items are excluded, and veiled entities appear by title only.

1. "Session {n} opened on {strong-start title}."
2. "They went to {played scene and place titles}."
3. "They met {kept or shortlisted NPC titles}."
4. "They learned {found clue titles}."
5. One sentence per front whose clock moved: "{front}: {from} → {to}." Full clocks add "It's full: {doom}."
6. "Still open: {open thread titles}."
7. "Notes from the table:" followed by `note` texts as a list.

The form has a recap textarea (label "Recap", prefilled, editable) and a read-only clock summary. **Save recap** sets `session.recap`, `recapSavedAt` and `status: 'done'`, then navigates to `/`.

**Export nudge** (D35): if the campaign was never exported, or `lastExportedAt` is more than 14 days old and a session has finished since, the page shows the Banner "You haven't backed up this campaign lately. It lives only on this device." with **Export a backup**.

### 7.6 Shortlist rules

- **Sources:**
  - **Flesh out later** at the table (a card, no entity);
  - **Shortlist** in the wrap-up (an entity);
  - **Add to shortlist** on a Codex Detail page (an entity).
- **Shown:** the prep Shortlist panel (every step; open by default on step 2), the dock **Shortlist · n** key (this session's items), and the Codex filter "On the shortlist".
- **"Yes, flesh out" or the yesLabel:**
  - **For an entity:** opens an inline flesh-out card in the panel. For an NPC, the empty fields (want, secret, tell, voice) are filled from a fresh `fantasy.npc` card for the entity's culture. Filled fields are never overwritten. The DM edits, and **Keep** sets `canon: 'kept'` and `status: 'fleshed'`.
  - **For a card-only item:** creates the entity from the card first.
  - **"Make NPC":** creates an npc titled from the item. **"Move it":** opens the place and scene picker.
- **Later:** stays open and increments `deferrals`. At 3 deferrals the question becomes "Still want this? It's waited three sessions." (D33).
- **Let go:** sets `status: 'let-go'`. A provisional entity is deleted. A kept entity stays in the Codex and simply leaves the shortlist.

### 7.7 S4 tests and acceptance

1. Unit tests:
   - `drafting.ts`: mention detection (longest match, folding, no partial words), first-sentence cut, the draft set per step, deterministic for a seed;
   - `draftRecap` over fixture ledgers (empty lists skipped, let-go excluded, clock sentences);
   - shortlist state machine (deferral wording at 3);
   - wrap-up row derivation from a fixture session.
2. Component tests: each step renders its question, why-we-ask, nudges and drafts. Keep, Edit and Toss write the right rows. Skip, Back and autosave work, including after a remount. The three-clue warning appears and clears. Planned ticks reach Start session. The wrap-up's Keep the rest, Undo and Let go removal all work.
3. e2e: J1 at all four viewports, plus a prep resume journey (leave at step 3, reload, continue).
4. A timed manual check: a fresh DM completes all six steps with real answers in ≤ 30 minutes, and a 10-row wrap-up takes ≤ 2 minutes. These are recorded in the slice review.

---

## 8. Slice S5: hardening

### 8.1 Data safety

- **`navigator.storage.persist()`** is requested once, at the first campaign creation (D36), and again from Settings → Data on demand. The result is shown in Settings.
- **Quota:** `navigator.storage.estimate()` runs at start-up and before building the Pocket. Above 80% usage, a Banner reads "This device is nearly out of space for Prep Desk. Export a backup to be safe." with **Export a backup**.
- **Write failures** (`QuotaExceededError` or any Dexie error) are caught in `actions.ts` and the repo layer. The page shows the Banner "Prep Desk couldn't save that. Your earlier notes are safe. Export a backup, then free some space and try again." with **Export a backup** and **Copy error details**. Nothing partial is written, because every action is one transaction.
- **IndexedDB unavailable** (the open fails with `MissingAPIError`, `InvalidStateError`, `UnknownError` or a `SecurityError`) triggers the in-memory fallback (D26): the app reopens `PrepDeskDB` with `{ indexedDB, IDBKeyRange }` from a lazily imported `fake-indexeddb`. A persistent Banner on every route reads "This browser isn't letting Prep Desk save. Everything works, but it's gone when you close the tab. Export before you leave." with **Export a backup**.
- **The export reminder:** the Home tile "Last backup" and the recap-page Banner (D35).
- **iOS:** the Settings tip about the Home Screen (§7.1) and the same tip as a dismissible Banner on Home after the first finished session, shown only on iOS Safari outside standalone mode.

### 8.2 Version and update flow

- The app version becomes `0.2.0` at MVP, and both content packs become `0.2.0`. The Settings footer reads "Prep Desk 0.2.0 · fantasy content 0.2.0".
- Updates use the prompt chip (§6.10) with **Reload to update** and **Not now**. Schema upgrades run on the reload.

### 8.3 Empty states (header, value sentence, CTA, inside the pattern's frame)

| Screen                     | Header                     | Sentence                                                                              | CTA                                             |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Home, first run            | Your desk is clear         | Create a campaign and Prep Desk will roll tonight's names, places and twists for you. | **Create a campaign**                           |
| Campaign list              | No campaigns yet           | Each campaign keeps its own Codex, sessions and safety settings.                      | **Create a campaign**                           |
| Codex list                 | Nothing in the Codex yet   | Everything you prep or improvise lands here, linked, so you can pull it up mid-game.  | **Start prep** (secondary: **Create entry**)    |
| Codex search, no match     | No entries match "{q}"     | Try a shorter word, or clear the filters.                                             | **Clear all filters**                           |
| Connections tab            | No connections yet         | Linking people, places and clues lets you find one from the other at the table.       | **Add connection**                              |
| History tab                | Not seen at the table yet  | When this shows up in a session, the Ledger lines appear here.                        | none (read-only; a link to the Codex)           |
| Ledger                     | The Ledger is listening    | Anything you use from the Pocket or the Dock is written here with the time.           | **Add a note** (focuses the field)              |
| Focus slot                 | Brought-in cards land here | Tap a name, NPC or place to bring it in.                                              | none (an inline hint, not a page)               |
| Fronts in Table            | No fronts yet              | A front is trouble that moves on its own. Add one in prep step 3.                     | **Add a front** (create slide-over, kind front) |
| Shortlist panel            | Nothing waiting            | Things you set aside at the table show up here for next prep.                         | none (a panel hint)                             |
| Wrap-up, nothing to review | Nothing to decide          | You didn't improvise anything that needs a call.                                      | **Draft the recap**                             |

### 8.4 Error states

- **A React error boundary per Table zone** (Pocket, Spread, Ledger, Dock): "This part of the table hit a problem. The rest still works." with **Reload this part** and **Copy error details**.
- **A route-level boundary elsewhere,** with the same pattern.
- **Content pack load failure** (it shouldn't happen, but is guarded): "Prep Desk couldn't load its tables. Reload, and if it keeps happening, copy the details for a bug report."
- **Not-found ids:** §3.3. **Import errors:** §5.9. **Storage errors:** §8.1.
- **Copy:** every error says what happened, why it matters and what to do next, in under two sentences, and never blames the DM.

### 8.5 First-run onboarding

There is no tour. The first-run path is:

1. Home empty state → **Create a campaign**.
2. The form, including session zero.
3. Home with "Session 1 is next" and **Start prep for Session 1**, plus **Open the table** with the hint "No prep? The Pocket rolls itself."
4. The first prep visit shows the rail hint "Six steps, about five minutes each. Skip any of them; the Pocket fills the gaps."
5. The first Table visit shows a one-time inline card in the Spread: "Tap a name to use it. Everything you use is written in the Ledger, and you can undo any line." with **Got it**. This is stored in `settings.tableHintSeen`.

### 8.6 Hosting note

`pnpm build` produces `apps/web/dist`, a static site. S5 adds `public/_redirects` (`/* /index.html 200`) for SPA fallback on Netlify and Cloudflare Pages, and a "Deploying" section in `README.md` (build command `pnpm build`, output `apps/web/dist`, Node 22). Connecting a host needs the owner's account and is out of scope.

### 8.7 S5 acceptance

MVP acceptance A1–A8 (§1.1), plus:

- every empty and error state in §8.3–8.4 has a component test;
- the fallback Banner appears when `indexedDB.open` is stubbed to throw (component test and e2e via `addInitScript`);
- the quota Banner appears with a stubbed `estimate`;
- `docs/ui-page-patterns.md` is updated with the built patterns, including Console once the owner confirms it.

---

## 9. Safety across the product

- **One rule:** the campaign's `{ lines, veils }` reaches every engine call through `contextFor()` or the `safety` option: generators, rerolls, batches, table rolls, the oracle and its meaning words, moves, and Stuck? parts. The engine's single choke point (`selectEntry`) enforces lines. The UI never filters text by itself.
- **Names** are covered by authoring-time review, the `culture-safety` lint and `banned` regexes (D11).
- **The DM's own text** (answers, notes, edits, recaps) is never filtered or flagged.
- **Toggling** lines or veils calls `applySafety` on unused generated cards only, with no reshuffle (§6.11). Kept records are never rewritten (D12).
- **Defaults:** a new campaign has the line `child-harm` and no veils. A test asserts that a campaign created without touching the safety control stores `lines: ['child-harm']`.
- **The Pocket review** (step 6) and the Table ⋯ menu both show the current lines and veils, with a way to change them.

---

## 10. Keyboard shortcuts (D42)

No shortcut fires while focus is in an `input`, `textarea` or `contenteditable` (this includes the handwriting answer fields), or while a modal is open. The exception is Escape.

| Key         | Where                                          | Action                                                   |
| ----------- | ---------------------------------------------- | -------------------------------------------------------- |
| `/`         | Table, TopBar routes                           | Focus Pull anything (Codex list: focus the Codex search) |
| `Mod+K`     | anywhere                                       | Open Pull anything                                       |
| `Escape`    | tray, popover, dialog, slide-over, inline edit | Close or cancel and restore focus                        |
| `?`         | anywhere                                       | Open the Keyboard shortcuts dialog                       |
| `s`         | Table                                          | Stuck?                                                   |
| `1`–`6`     | Table                                          | Dock tiles Name, NPC, Place, Twist, Treasure, Encounter  |
| `o` / `m`   | Table                                          | Oracle / Moves deck                                      |
| `r`         | Table, tray open                               | Reroll unlocked fields                                   |
| `Enter`     | Table, tray open, focus on the card            | The tray's primary action (Use it / Give / Set as scene) |
| `Mod+Z`     | Table                                          | Undo the newest Ledger event that is still undoable      |
| `Mod+Enter` | Prep                                           | Next step (Finish prep on step 6)                        |
| Arrow keys  | Tabs, Segmented, StepRail, Combobox            | Move the selection                                       |

Tooltips on keys show their shortcut with `Kbd`.

---

## 11. Copy and voice

- **Warm and human,** second person to the DM, sentence case, no exclamation marks, no "AI" and no "generate" in the UI. The verb for randomness is **Roll** (Roll, Reroll); the desk's own work is "the desk drafted".
- **Verb-first buttons:** Create campaign, Start prep, Keep, Toss, Let go, Shortlist, Pin to scene, Flesh out later, Use it, Bring in, Set as scene, Share, Give, Mark found, Tick +1, Ask, Draw a move, End session, Save recap, Export a backup. Never OK, Submit or Continue (except the wizard's "Next: {step name}").
- **Labels** are always visible. Placeholders only show format examples (for example "the ferryman").
- **Errors** follow §8.4 and the `errors` skill. **Destructive confirms** name the thing.
- **Numbers and time** use mono type (`1:42`, `3 of 6`). Session references read "S7" in stamps and "Session 7" in prose.
- **Safety words** stay neutral: "hidden by your lines", "veil: {topic}, fade to black".

---

## 12. Testing strategy

### 12.1 Levels

| Level                    | Tool                                                       | Covers                                                                                                            |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Engine unit and property | Vitest                                                     | situations, new lint rules, determinism snapshots, the extended I3 safety property, content tests (§4.6), benches |
| Data                     | Vitest + `fake-indexeddb/auto`                             | repo functions, transactions and undo, wiki links, search, export round trips, migrations                         |
| Pure features            | Vitest                                                     | `buildPocket`, `drafting`, `draftRecap`, the shortlist state machine, the timer, wrap-up row derivation           |
| Component                | Vitest + Testing Library + fake-indexeddb + `MemoryRouter` | every screen's states, keyboard paths, focus management, layout-shift checks with `getBoundingClientRect`         |
| e2e                      | Playwright (`--mode e2e`)                                  | journeys J1–J3, axe, 44 px, overflow, offline, update chip                                                        |

### 12.2 Rules

- **TDD:** write the test, watch it fail, then implement. Every bug fix gets a test.
- **Determinism:** engine-backed features take seeds. In e2e mode only (D37), `settings.e2eSeed` makes `newSeed()` call sites in the app derive seeds from `${e2eSeed}:${counter}`, so journeys are reproducible. A production build ignores the setting (the gate is `import.meta.env.MODE === 'e2e'`, replaced at build time).
- **No vacuous tests:** each test must fail if the behaviour is removed. Reviewers spot-check by mutation: delete the line under test, see red, and keep the log. Tests that only assert "renders" are not accepted. Random-property tests assert a non-vacuity count (the property was actually exercised).
- **Clean-checkout rule (R29):** each slice's acceptance includes a fresh `git clone` into the scratchpad, `pnpm install --frozen-lockfile`, then every CI step in CI order.
- **Real CI green:** a slice is complete only when its commit's GitHub Actions run is green. After combining parallel work, the full e2e runs on the combined tree before pushing.

### 12.3 e2e journeys

- **J1, the full loop** (each of the four viewports), with e2e seed `E2E-0001`:
  1. Create "The Salt Marsh Debts" with a veil on gore.
  2. Prep: add 2 PCs, spotlight one; answer step 3 for a new front; write a step 4 opening plus 2 scenes; add 3 truths with clue drafts kept and 2 places; lock one Pocket name and Finish prep.
  3. Start the session. Use a Pocket name with the note "ferryman", bring in a Dock NPC, ask the oracle, draw a move, use Stuck?, tick the front, mark a clue found, add a note with Ask me after, and undo one event.
  4. End the session. In the wrap-up, Keep the NPC, Shortlist the note, Let go one item, and save the recap, which contains the NPC's name.
  5. In the Codex, Pull anything "odr" finds the NPC and its History shows the Ledger line.
  6. Export JSON (parse it and assert counts) and Markdown (unzip and assert `NPCs/<name>.md`).
- **J2, offline:** after one load of `/`, go offline, reload, create a campaign, open the table, run step 3 of J1, reload, and assert the Ledger is intact. Any non-service-worker request fails the test.
- **J3, safety:** a fixture campaign with seed `E2E-SAFE`. Assert that a known spider-tagged trinket is in the Pocket. Add the line `spiders` mid-session: that field shows `—`, and every other field of every Pocket card is unchanged (compared through `serializeCard` before and after). Remove the line: the field returns. Assert the oracle and Stuck? never show lined words across 30 draws under the strict-lines fixture.

---

## 13. Risks

| Risk                                                                                        | Impact                                         | Mitigation                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS Safari clears script-written storage after 7 days without a visit (non-installed sites) | A campaign could vanish                        | Home Screen install tip, `persist()`, export reminder, JSON restore. Eviction can't be detected reliably on iOS (localStorage is cleared too), so prevention is the only defence. Stated plainly in Settings. |
| A service worker update lands mid-session                                                   | A reload would lose the DM's place             | Prompt mode only; no chip on a live table; migrations only on reload; all state is in Dexie, so even a forced reload resumes exactly.                                                                         |
| IndexedDB blocked (private mode, enterprise policy)                                         | Nothing persists                               | fake-indexeddb fallback with a permanent Banner; export still works.                                                                                                                                          |
| Large campaigns (5,000+ entities, 50 sessions, 20,000 Ledger rows)                          | Slow search and lists                          | Indexed queries, in-memory search with a jsdom bench, paginated Codex, Ledger renders 200 rows, History loads more on demand.                                                                                 |
| Content volume vs quality (about 1,900 new entries)                                         | Bland or repetitive tables, missed safety tags | S1 split into a working half and a content half; CONTRIBUTING rules; the strict-lines test; reviewer sign-off; counts are minimums, so cut weak entries rather than pad.                                      |
| Situation names echo a published tag list                                                   | Licensing and reputation                       | Originality check against the Without Number lists in review (§4.2).                                                                                                                                          |
| The Console pattern is rejected by the owner                                                | Layout rework                                  | The zones are components and the pattern is only their arrangement. A switch to, for example, Split Pane changes `TableMode.tsx` layout only (D13).                                                           |
| Portrait tablet (834) is cramped with three zones                                           | Unreadable Spread                              | The Ledger collapses by default in portrait orientation (D14); the Pocket has a minimum of 240 px.                                                                                                            |
| Accidental taps at the table                                                                | Wrong things logged                            | Undo on every event, with an inline undo for 8 s (D9).                                                                                                                                                        |
| Rule-based drafts feel shallow next to AI tools                                             | Prep feels like busywork                       | Drafts lean on the DM's own sentence and real Codex mentions, and every step can be skipped. An AI "flesh out" button stays a post-MVP experiment (brief §5).                                                 |
| Mention matching hits a common word (an NPC titled "Rook")                                  | Wrong links                                    | Whole-word matching, a minimum of 3 characters, and kept drafts show their links for review before keeping.                                                                                                   |
| A share code from an older pack version reproduces a different card                         | Confusing shares                               | Share codes report `exact`. The Codex stores card JSON and entity fields, never codes.                                                                                                                        |

---

## 14. Out of scope (MVP)

- Accounts, sign-in and cloud sync (Supabase), and multi-device use.
- Maps and dungeons (the 5-room generator and the map renderer). The Map dock tile is omitted.
- PDF export, printable Pocket and handouts.
- System packs, stat blocks and encounter balancing (5e SRD).
- Genres 2–5 and the community contribution pipeline.
- Foundry and other VTT exports.
- A user-built table editor UI and user pack import UI (the engine's `validateUserPack` stays, but there is no screen). Forge is hidden.
- A player-facing view and live sharing.
- Hosting and domain setup. The static build and the deploy note ship, but the account is the owner's.
- AI features of any kind.
- A relationship graph canvas (the MVP has the Connections tab), a separate faction kind and faction turns (fronts with clocks cover factions in the MVP), and a pronunciation generator (D38).
- Importing other tools' data (Obsidian, World Anvil). Only Prep Desk JSON restore is in scope.

---

## 15. Decisions

Each line reads: Decision · why · cost if wrong.

1. **D1: tag pairs are a new `situation` content kind plus `situation` and `facet` field sources, compiled to plain tables.** · It keeps one safety choke point and gives cards, locks and share codes to seeds. · An engine change with lint work; if it proves awkward, situations could be flattened into per-situation generators later.
2. **D2: six facets (enemy, friend, complication, thing, place, pressure), 20 situations of 4 entries per facet.** · `pressure` feeds prep step 3, and 20 situations give 190 distinct pairs. · More writing per situation; it can drop to 3 entries.
3. **D3: no `CampaignLookup` in the MVP; content reads serialisable `ctx.*` keys.** · `card.context` drops the hook (R19), so stored cards would lose campaign context on reroll. · Campaign-aware slots are limited to the keys the app passes.
4. **D4: entity `fields` are authoritative; the card JSON is provenance only.** · DMs edit what they keep, and cards never silently change. · Two copies of a value can differ (intended).
5. **D5: one `entities` store with a `kind` discriminator.** · One search index, one link model, a simple export. · Kind-specific queries need the compound index.
6. **D6: truths and clues are separate kinds, linked `points-to`.** · The three-clue rule needs something to count clues against. · Lazy-DM users may expect "secrets" as one list; the Codex filter shows both.
7. **D7: NPCs, places and items used at the table become provisional entities at once; rumors, encounters and scenes are created kept.** · Recall mid-session (search, Who's here) needs them to exist, and only the "recurring?" kinds need a wrap-up call. · Clutter if wrap-ups are skipped; mitigated by the "left to review" tile.
8. **D8: Let go deletes the entity but keeps the Ledger text and the used name.** · The table heard it, so it should never be offered again, and the log stays honest. · A let-go name can't be reused without editing usedNames.
9. **D9: every Ledger event can be undone; undo reverts its payload and deletes the event.** · Accidental taps on a tablet. · The payload adds code to every action.
10. **D10: oracle answers and drawn moves log on reveal.** · Asking is using, and it saves a tap. · Exploratory draws clutter the Ledger (undo exists).
11. **D11: names carry no safety tags; examples and voice tips are linted and reviewed.** · Sound-rule names have no topic. · A rare unfortunate generated name relies on `banned` regexes.
12. **D12: safety toggles rewrite only unused generated cards; kept records only get a notice.** · Kept text is the DM's record. · A kept entity may still show a lined detail until the DM edits it.
13. **D13: Table Mode uses a new "Console" pattern (owner to confirm).** · No catalogue pattern fits a live, editable, logged console. · Layout rework of `TableMode.tsx` only.
14. **D14: the Ledger zone is collapsible and collapsed by default in portrait orientation.** · 834 px can't fit three zones well, and an orientation query avoids a fourth width breakpoint. · Portrait DMs open the Ledger from the menu.
15. **D15: the Map dock tile is omitted (no disabled placeholder).** · Maps are out of the MVP. · The dock looks different from the mockup.
16. **D16: Pocket tabs are Names, NPCs, Places, Rumors, Loot; twists are a hidden pool behind Twist and Stuck?.** · The mockup has five tabs and the catalogue caps horizontal tabs at five. · DMs who want to browse twists use prep step 6 or the Twist tile.
17. **D17: Stuck? = one move, one twist (Pocket first) and one meaning pair, each rerollable.** · It matches the mockup caption "move + twist + prompt". · Three parts may be more than a stuck DM reads; each part is one line.
18. **D18: the Pocket holds 6 names per culture, 6 NPCs, 4 places (tavern, shop, 2 locations), 6 rumors, 6 loot and 6 twists (46 results).** · Research §4 kit sizes, within the 60-result budget. · Easy to retune in `pocket.ts`.
19. **D19: planned clock ticks apply at Start session and are logged "(planned in prep)".** · The mockup says "will tick to 4 at the start of the game". · DMs who start late in the evening see ticks they forgot (visible in the Ledger, undoable).
20. **D20: the session timer is `startedAt` plus `pausedMs`, paused by tapping it.** · It survives reloads and breaks. · One more control on the bar.
21. **D21: no update chip on a live table; an update item in the menu instead; the chip clears the dock.** · Never interrupt or reload mid-session, and it resolves the Task 15 z-index finding. · DMs may run an old version for a whole session.
22. **D22: Pull anything searches Codex entities, tonight's Pocket and commands, but not Ledger text.** · It answers "who was that?" and doubles as a command bar. · Searching the log needs the History tab.
23. **D23: a home-grown search index, no library.** · Small, offline, testable, with ranking we control. · More code than MiniSearch; swappable behind `search.ts`.
24. **D24: Markdown export is an Obsidian-style vault zipped with `fflate`.** · The owner asked for Markdown/Obsidian, and one file per entity keeps `[[links]]` working. · One small dependency.
25. **D25: JSON restore is included.** · A backup that can't be restored doesn't protect data. · Import validation code and a replace dialog.
26. **D26: in-memory fallback with fake-indexeddb behind the same Dexie schema.** · `useLiveQuery` keeps working and there is no second data layer. · About 90 KB, lazily loaded only when needed.
27. **D27: Forge is hidden from navigation in the MVP.** · Its generator list and table editor are outside R35, and placeholders score as unfinished. · Generators are reachable only through Table, Prep and Pull anything.
28. **D28: campaign-scoped routes, with the old mode paths redirecting.** · Ids in URLs make reloads and back navigation exact. · Longer URLs.
29. **D29: Prep and Table use focused chrome (FocusBar, TableBar) instead of the TopBar.** · It matches both mockups and keeps attention on the task. · Mode switching is one extra tap from those screens.
30. **D30: prep drafts come from mention matching, the DM's own first sentence and tables; no semantic parsing.** · No AI at launch, and honest output. · Drafts can feel generic when the answer mentions nothing known.
31. **D31: Session 1 replaces step 2's question with "What do the players already know?"** · There is no last time on the first night. · One extra step variant to test.
32. **D32: the table can start with no prep; the Pocket rolls at Start session.** · The owner's #1 moment is the table, and skipping is always allowed. · Unprepped sessions have no scenes or truths.
33. **D33: after 3 deferrals, a shortlist question becomes "Still want this?"** · It stops the shortlist turning into a graveyard. · A few DMs will find the nudge pushy.
34. **D34: wrap-up is Inbox A (triage rows) followed by a recap Form page.** · One job per screen in the catalogue. · Two screens instead of one.
35. **D35: export reminder when never exported, or older than 14 days with a session finished since.** · Weekly groups get about one reminder a fortnight. · Too quiet for daily players, too loud for none.
36. **D36: `persist()` is requested at first campaign creation.** · A user gesture with clear intent to keep data. · Some browsers ignore it; status is shown in Settings.
37. **D37: an e2e-only seed setting makes journeys deterministic.** · Assertions on specific content need fixed rolls. · The build-time gate must drop it from production (tested).
38. **D38: no pronunciation generator; an optional `fields.say` the DM can type.** · Phonetic rules per culture are a content project of their own. · The mockup's "OH-drin VAY" appears only when typed.
39. **D39: safety is set per topic with a Fine / Veil / Line control, grouped in five groups.** · One control per topic avoids a topic being both a line and a veil. · 25 controls is a long form; the groups make it scannable.
40. **D40: the relationship view is a Connections tab of grouped links, not a graph.** · Page-patterns bans node-graph canvases, and lists work at 390 px. · Less visual than Kanka's web.
41. **D41: keep the 3 cultures, each raised to 16 examples and 4 voice tips; cultures can be switched off per campaign.** · Quality over count; the mockup shows 3. · Less variety until more cultures ship.
42. **D42: single-key Table shortcuts (`s`, `1`–`6`, `o`, `m`, `r`), off inside text fields.** · Keyboard and Bluetooth-keyboard tablet DMs move fast. · Single keys can surprise; the `?` dialog documents them.
43. **D43: prep time counts only while a prep route is visible.** · "About 16 to go" should mean thinking time. · Time spent thinking away from the screen isn't counted.
44. **D44: write-through persistence, no optimistic state.** · One source of truth with tiny local writes. · A slow disk would show its latency (budgeted at ≤ 100 ms).
45. **D45: app ids are a prefix plus 16 Crockford characters from `getRandomValues`.** · They work on plain-http LAN tablets (M4) and are readable in exports. · Not UUIDs.
46. **D46: the MVP is app version 0.2.0 with content packs 0.2.0.** · It marks the first usable release. · Cosmetic.
47. **D47: renaming an entity rewrites `[[links]]` everywhere and keeps the old title as an alias.** · Links never break silently. · A larger transaction on rename.
48. **D48: "Flesh out later" from a tray saves only the card, with no entity and no Ledger line.** · Nothing was used in play, so the Codex and the log stay true. · The item isn't searchable until it's fleshed out.
49. **D49: the Ledger is chronological with the newest at the bottom, auto-scrolling unless the DM scrolled up.** · It matches the mockup and reads like a log. · DMs who want newest-first must scroll.
