# Prep Desk

A free, tablet-first improv kit for tabletop game masters: generators, a live "Table Mode", a six-step prep interview and a campaign wiki. System-agnostic core with optional system packs. No AI in the product at launch.

Read before changing anything:
- Spec: `docs/superpowers/specs/2026-11-08-foundations-and-content-engine-design.md` (binding)
- Plan: `docs/superpowers/plans/2026-11-08-foundations-and-content-engine.md`
- Product brief and decisions: `docs/research/2026-11-08-product-brief.md`

## Layout

```
apps/web/               React 18 + Vite PWA ("Ink & Index" kit in src/kit, shell in src/app)
packages/engine/        @prepdesk/engine: pure TypeScript, no DOM, no storage, no network
packages/content-core/  moves deck (YAML source, compiled to dist/core.json)
packages/content-fantasy/ cultures, NPC tables, oracle (YAML → dist/fantasy.json)
tools/content-cli/      thin file reader over the engine's compile and lint
```

## Commands

```
pnpm lint            eslint + prettier --check
pnpm typecheck       all packages
pnpm test            vitest, all packages (engine globalSetup rebuilds content packs)
pnpm content:lint    lint every content pack
pnpm content:build   compile packs to dist/ (gitignored)
pnpm build           content:build, then build the web app
pnpm e2e             Playwright (added in the last plan task)
```

Before committing, run `pnpm lint && pnpm typecheck && pnpm test`.

## Hard rules

- **Engine boundary:** `packages/engine` imports nothing from the repo and no DOM types. Only `zod` and `yaml` at runtime. The web app imports compiled JSON packs only.
- **Safety beats everything:** lines are never selected, never relaxed, and they override locks. Any content entry that touches a topic in the safety vocabulary must carry its tag. When unsure, tag it.
- **Original content only:** no text copied from any published game or site. Content is CC-BY-4.0.
- **Ids** are namespaced and lowercase (`fantasy.npc.want`). User packs use the `user.` prefix.
- **Field references** (`{role}`) are allowed only in a generator's `display`, never in `template` fields (keeps share codes exact).
- **Accessibility:** interactive targets at least 44×44px, visible focus ring, text contrast at least 4.5:1 in light and dark, respect `prefers-reduced-motion`, no horizontal page scroll at 1194, 834, 1440 or 390 wide.
- **Styling:** tokens in `apps/web/src/styles/tokens.css` only, no raw hex in component CSS. Hand-drawn "ink" applies to borders, never to text.
- **Fonts self-hosted** (works offline). No Google Fonts requests.
- **TDD:** write the test, watch it fail, then implement. Every bug fix gets a test.

## Git

- Work on the branch named in the task. Never push to `main` or another branch without being asked.
- Do not open a pull request unless asked.
- Commit after each task; never commit failing tests.

## Subagent-driven build

The plan is being executed task by task by fresh subagents, each reviewed before the next starts. The controller keeps a ledger at `.superpowers/sdd/2026-11-08-foundations-and-content-engine/progress.md` (gitignored). It records progress, deferred minor findings, and every numbered controller ruling (`R1`, `R2`, …). If a session restarts, trust the ledger and `git log`, and never redo a task marked complete.
