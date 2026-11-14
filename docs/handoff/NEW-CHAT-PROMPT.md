# Paste this into the new chat

You are taking over a half-built web app, Prep Desk, in the GitHub repo `TheGMChef/Claude`, branch
`ccr-44bc3dc3-wdo7jt`. Work only on that branch. Do not open a pull request unless I ask.

Start by reading, in this order: `docs/HANDOFF.md`, `CLAUDE.md`, `.ux-profile.md`, then the plan
`docs/superpowers/plans/2026-11-10-mvp-min.md`. The rulings behind earlier decisions are in `docs/handoff/ledger-*.md`.

State: the engine, 59 content tables, the design kit, the app shell and the whole local data layer (Dexie, wiki links,
search, validated backup and restore) are finished, tested and green on GitHub Actions. The visible pages are still
stubs. Your job is to finish the minimum shippable product: tasks M3 to M12 of the plan.

How to work (this matters, the last session lost its budget on over-checking):

1. Build the visible product first, one page at a time, in this order: create campaign (M3), the real Forge (M6),
   Codex list (M8), create/edit entry (M7), entry detail (M9), settings with export and restore (M5), home (M4).
   Promote the working generator UI in `apps/web/src/dev/ForgePreview.tsx` into the real Forge.
2. Test first, but keep it lean: `pnpm lint && pnpm typecheck && pnpm test` before every commit, one e2e smoke per page,
   and check the real GitHub Actions run after each push.
3. No per-task reviewer loops and no mutation-proof ceremonies. Do one safety and data-loss review at the very end.
4. Do not run parallel agents in one checkout. Do not use `git stash`.
5. Never weaken the safety rules in section 5 of `docs/HANDOFF.md`: the campaign's current safety lines must always
   apply, only through `apps/web/src/content/safety.ts`; strict CSP; no innerHTML; 44 px targets; no pills.
6. If something is ambiguous, pick the plan's default and keep going. Tell me what you decided in one line.

When M3 to M9 and M5 work end to end (create campaign, roll, hold, reroll, save, link, search, back up, delete,
restore, reload offline), finish with M10 (e2e), M11 (README and `_redirects`), then give me a short list of what is
in and not in this release. Run the app and show me screenshots of the Forge and the Codex at tablet and phone width.

First reply: confirm you read the handoff, say which task you are starting, and start it.
