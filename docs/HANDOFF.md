# Prep Desk: handoff to a new session

Written 2026-11-14 by the outgoing session. Read this first, then `CLAUDE.md`.

## 1. The product in three lines

Prep Desk is a free, tablet-first improv kit for tabletop game masters (D&D or system-agnostic): 15 generators of
original content (NPCs, places, taverns, shops, rumors, secrets, clues, complications, treasure, encounters, adventure
seeds, prep pressure and spotlight), a campaign **Codex** (saved entries with wiki links), session-zero **safety
lines** that always win, backup and restore, and offline PWA use. No AI, no accounts, nothing leaves the device.

## 2. Where it stands (verified 2026-11-14)

- **Repo:** `TheGMChef/Claude`, branch `ccr-44bc3dc3-wdo7jt`, HEAD `3f4d7bd` (plus the handoff commit that adds this
  file). Everything is pushed. No pull request is open. The default branch and merge choice are the owner's.
- **CI:** real GitHub Actions on `3f4d7bd` is green (CI run 95, CodeQL run 40).
- **Local proof on the same tree:** clean clone passes `pnpm lint`, `pnpm typecheck`, `pnpm test` (1,327 tests),
  `pnpm test:coverage` (engine, 97% statements), `pnpm content:lint`, `pnpm audit --audit-level moderate`
  (1 waived low), `node scripts/licenses.mjs --check`, `pnpm build`, and the Playwright e2e (233 passed, 71 skipped
  by design).
- **The app is now usable end to end** (as of commit 72125fb): create a campaign, roll in the Forge, hold and roll
  again, save to the Codex, search, open and delete entries, edit safety, back up and restore. See `docs/STATUS.md`
  for the checklist of what is left (entry editing page, Home polish, README, final review).

### Done (all reviewed, all green)

| Area | What exists |
| --- | --- |
| Engine (`packages/engine`) | Seeded generation, tables, generators, situations/facets, locks and reroll, safety (25 tags, lines never selected, override locks, veils), share codes, card JSON, user-pack validation, ReDoS/YAML-bomb/template-explosion guards, `article()` rule |
| Content (`packages/content-*`) | 59 tables, 20 situations, 24 GM moves, 100 oracle words, 3 cultures. All original, CC-BY-4.0, tagged for safety, reviewed table by table, plus a whole-pack acceptance review (no safety leaks across 25 lines x 15 generators x 2,000 seeds) |
| Design system (`apps/web/src/kit`) | "Ink & Index" kit: raised keys, cards, tabs, chips, tooltip, Dialog, EmptyState, Pagination, leave-without-saving guard |
| App shell | Routes, TopBar (Forge, Codex, Settings), redirects, not-found, storage-blocked page, DB provider and hooks, generator-to-kind table and field labels (`content/fields.ts`) |
| Data layer (`apps/web/src/data`) | Dexie schema v1 (frozen), repositories, entities with wiki links (rename-safe), search (median 2 ms at 5,000 entries), JSON backup export and validated, all-or-nothing restore, safety wrappers (`content/safety.ts`) that always apply the campaign's current lines |
| Security | CSP and headers, dependency audit gate, pinned actions, CodeQL, secret scan, input caps, hostile-file tests |

### Not done (the whole remaining job)

All of these are stubs today under `apps/web/src/features/**`. The plan for each is in
`docs/superpowers/plans/2026-11-10-mvp-min.md` (986 lines; tasks **M3 to M12**).

| Task | Deliverable |
| --- | --- |
| M3 | Create campaign page with the safety picker (default line: `child-harm`) |
| M4 | Home: first-run screen, campaign list, **Restore from backup** with the replace Dialog |
| M6 | The real **Forge**: pick a generator, Roll, hold fields, Roll again, Save to Codex, recheck when safety changes |
| M7 | Create and edit entry pages (per-kind fields) plus `WikiText` links with `Create "X"` |
| M8 | Codex list with search and pagination |
| M9 | Entry detail page |
| M5 | Settings: name, safety (instant save), shortcut switch, **Export backup**, Restore, delete campaign |
| M10 | End-to-end journey, axe, 44 px, overflow, privacy specs |
| M11 | `_redirects`, root README, version, release notes |
| M12 | Final checks and one safety/data-loss review |

Wave 2 (M3, M4, M6, M7, M8) was started in parallel and **all five agents died on the weekly usage limit before
committing anything**. No partial work exists. Start these from the stubs.

## 3. Honest evaluation: why this got slow, and what to change

The outgoing session spent most of its time in a review loop: an implementer, then a reviewer, then a fix round, then
a re-check, for every small task, with mutation-testing demands and clean-clone proofs on each commit. That produced
very safe code and an engine and content pack in good shape, but it burned the usage budget and left the visible
product unbuilt. The advice to the next session:

1. **Build the visible product first.** Do M3 -> M6 -> M8/M7 -> M9 -> M5 -> M4 in that order, one page at a time,
   each with unit tests and one e2e smoke. The data layer is done and well tested; do not re-review it.
2. **Drop the per-task reviewer loop.** Keep: test-first, `pnpm lint && pnpm typecheck && pnpm test` before each
   commit, e2e once per page, real CI green after each push. Add exactly **one** reviewer pass at the end, focused on
   safety and data loss (the Forge and restore).
3. **Do not use parallel agents in one checkout.** They fight over the working tree, the Playwright port and
   snapshots. If you must parallelise, give each its own `git clone` and `PW_PORT`.
4. **Skip nice-to-haves.** The plan already cuts a lot (see section 6). If time is short, the smallest useful
   release is: create campaign + Forge (roll, hold, reroll, save) + Codex list/detail + backup/restore. Settings
   beyond safety and export, Home polish and the campaign list can come after.
5. **Stop gold-plating content.** The 59 tables are done. Do not start another content round.

## 4. How to run and check

Node 22 (`.nvmrc`), pnpm 10.

```
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage   # before every commit
pnpm content:lint
pnpm build
pnpm --filter web dev                    # dev server; /forge-preview and /kit are dev-only pages
pnpm --filter web build:e2e && PW_PORT=4601 CI=1 pnpm e2e --trace off   # full e2e, own port
```

Check the real GitHub Actions run after every push (do not claim "green" from local runs alone). The CI job order is
lint, typecheck, test, content:lint, build, then e2e.

## 5. Rules that must not be broken (from `CLAUDE.md` and the rulings)

- **Safety beats everything.** Lines are never selected or relaxed and override locks. The app calls engine
  functions that take safety **only** through `apps/web/src/content/safety.ts`, which always applies the campaign's
  **current** lines (an ESLint rule bans the raw imports). A card exported with `lines: []` must still honour the
  campaign's lines. Never show or save the "nothing fits your safety settings" placeholder as content. Never store
  `hidden` card text. The DM's own text is never filtered.
- **Engine boundary:** `packages/engine` imports nothing from the repo and has no DOM types. S2 and the minimum cut
  change nothing in `packages/`.
- **Strict CSP** (`apps/web/public/_headers`): no `unsafe-*`, no eval, no `new Function`, no `innerHTML` or
  `dangerouslySetInnerHTML` (wiki text renders as React text). All `zod` imports go through `data/zod.ts`.
- **Accessibility:** 44x44 px targets, visible focus ring, contrast 4.5:1 in light and dark, reduced motion, no
  horizontal scroll at 1194, 834, 1440, 390, 375 and 1280 wide. Tokens only, no raw hex, no pills (raised "keys"),
  no emoji icons, ink only on borders.
- **Copy:** warm, sentence case, verb-first buttons, no exclamation marks, no "AI", no "generate" (the verb is
  **Roll**), errors never blame the DM and say what to do next.
- **Fonts self-hosted, no third-party requests.** Original content only (CC-BY-4.0).
- **Git:** work on the named branch, never push elsewhere, do not open a PR unless asked, stage explicit paths, never
  use `git stash` in a shared tree, never commit failing tests.

## 6. What was deliberately dropped (backlog B1 to B16)

Markdown vault export, an All campaigns page, the Connections tab, the Pull-anything palette (Mod+K), the History
tab, the Prep interview, Table Mode and sessions, wrap-up and shortlist, the in-memory storage fallback and its
banners, extra kit pieces (SlideOver, Popover), a Cultures setting, front clocks, Codex filters, share codes on the
Forge, the iOS Home Screen tip, a web coverage threshold. Each is listed in the plan and should be named in the
README's "Not in this release yet". The full spec for them is `docs/superpowers/specs/2026-11-08-mvp-design.md`.

## 7. Small known items worth fixing on the way

- Remove the unused `fflate` dependency (Task 9 was skipped) and regenerate `THIRD-PARTY-NOTICES.md`.
- Entry edit forms must send **only changed keys** (no whole-object overwrite).
- `entityFromCard` returns `{ ok: true, input } | { ok: false, reason }`: callers must unwrap it.
- `avoidNamesFor` returns newest first; the Forge must reverse it to chronological before passing it to the engine,
  with a test that the 8 most recent names reach the engine (ruling R63).
- Run the Forge safety tests for real: all 25 lines each alone across every generator, with a no-lines control that
  must find hits so the test is not vacuous.
- A `ForgePreview` unit test ("survives a Line on every vocabulary tag") timed out twice under heavy machine load;
  it passes alone. Raise its timeout if it flakes in CI.
- The app shows no CC-BY credit yet (the dev page does). Add it to Settings or an About line.
- Playwright's default port 4173 is shared; `PW_PORT` overrides it.

## 8. Decisions only the owner can make or do

- **Merge or PR:** decide the target branch and whether to open a pull request (none exists).
- **Hosting:** the config is host-agnostic (`_headers` and `_redirects`, Cloudflare Pages or Netlify). Connect an account.
- **GitHub settings:** turn on private vulnerability reporting (`SECURITY.md` points to it) and set the repository
  variable `ENABLE_CODEQL=true` if CodeQL scans on a private repo are wanted. Review Dependabot PR #1 (a CI-actions bump,
  checks pass).
- **Content checks no agent could do:** compare the 20 situation titles against the printed adventure-seed tag lists
  (Worlds/Stars/Cities Without Number, Ben Milton) and spot-check the 100 oracle words against published oracle lists;
  agents could only search the open web and recall.
- **UX-audit questions still unanswered** (type scale, spacing, weight 700, whether keys should animate box-shadow, the
  Table Mode "Console" page pattern for the later slice).
- **Front name in rumors:** some tavern rumors can show the DM-side front name as player-visible gossip; decide whether
  that is wanted when Prep arrives.

## 9. Document map

| File | What it is |
| --- | --- |
| `CLAUDE.md` | Project rules and commands (binding) |
| `.ux-profile.md` | Taste, bans, a11y, voice, icon rules |
| `docs/superpowers/plans/2026-11-10-mvp-min.md` | **The plan to execute (M1 to M12; M1, M2 done)** |
| `docs/superpowers/plans/2026-11-10-mvp-s2-codex.md` | Data-layer plan (Tasks 1 to 8 done) and decisions D51 to D70 |
| `docs/superpowers/specs/2026-11-08-mvp-design.md` | MVP spec (S1 to S5, decisions D1 to D50) |
| `docs/superpowers/specs/2026-11-08-foundations-and-content-engine-design.md` | Engine spec (binding) |
| `docs/research/2026-11-08-product-brief.md` | Owner's 30 answers and product decisions |
| `docs/security.md`, `SECURITY.md` | Threat model, CI checks, waivers |
| `docs/handoff/ledger-*.md` | Copies of the controller ledgers: every numbered ruling (R1 to R67) with its cost-if-wrong. The originals under `.superpowers/` are gitignored and will not exist in a fresh clone |
| `docs/superpowers/plans/2026-11-10-s1-backlog.md` | Non-blocking content findings |
