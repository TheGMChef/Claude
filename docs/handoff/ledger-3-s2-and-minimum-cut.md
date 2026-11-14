# S2 Codex ledger (gitignored)
Plan: docs/superpowers/plans/2026-11-10-mvp-s2-codex.md (21 tasks, decisions D51-D70). HEAD at start: 9b60fb4.
Standing delegation R34 applies: controller decides, owner audits in the final summary.

## Rulings
- R62 (planner questions, controller answers; each with cost-if-wrong):
  1. D53 schema v1 includes campaignId on drafts/prep answers + indexes now (freeze at S2 merge). Cost if wrong: a v2 migration in S3/S4 (small).
  2. D56 duplicate titles allowed with a warning, oldest wins. Cost: confusing links; mitigated by warning.
  3. D57 text-derived links not removable from Connections, explicit links confirm-to-remove, "Has part". Cost: minor UX friction.
  4. D60 hide Start prep / Open the table until S4/S3; Codex empty state main button = Create entry. Cost: none (additive).
  5. D62 Restore from backup also on /campaigns and first-run Home. Cost: tiny; required for new-device recovery.
  6. D63 unreadable cards in backup dropped, text kept, user told. Cost: silent partial data loss risk -> the restore summary must list dropped cards.
  7. Edit slide-over follows the spec (S5.7) even though >3 fields; revisit in ux-audit. Cost: pattern purity only.
  8. D58 search budget: hard-fail test at 100 ms (jsdom, 5,000 entities) to avoid CI flake; the 20 ms target is a reported bench. Cost: a perf regression between 20 and 100 ms won't fail CI.
## Progress
(none yet)
- R63 (Task 1-3 concern): avoidNamesFor returns newest-first per spec 5.2, but the engine takes avoid.slice(-8) (the LAST 8). Ruling: the data layer keeps newest-first; the S3 caller adapts at the engine boundary (reverse to chronological before passing), with a test that the 8 most recent names reach the engine. Cost if wrong: names guard sees old names (cosmetic).
## Progress
- Tasks 1-3 committed c56213b, 6975170, 5756af8; pushed; review pending.
- Tasks 1-3 review: approved (2 Important, 7 Minor). R64: fix now: (I1) full STORES_V1 freeze test; (I2) data/zod.ts re-export that imports the engine first + lint ban on bare `zod` elsewhere; (M3) add selectEntry to ENGINE_CALL_BAN and ban dynamic import()/require of the engine; (M7) doc/unexport nextSessionNumber. Deferred and carried: (M4) S3/S4 add wrappers for batch/rollTable/askOracle/drawMove/cardFromShare/generateName with required Safety + a "campaign overrides card" test each; (M6) Task 12 banner clears itself when db.open resolves, attach lifecycle right before open; (M8) S5 moves fake-indexeddb to dependencies; (M9) Task 21 adds a web coverage threshold; (M10) before S3, dev routes unreachable in production builds (verify); Task 21 privacy e2e asserts zero securitypolicyviolation during restore.
- R64 fix round committed 5d1ecad. Tasks 4-6 committed c3fb555, 3b0d43c, 5f18122 (pushed); review pending. Concerns noted: O(n) link resolve per save; rename can fail if a referrer hits the 20k field cap (rolled back); hostile-input timing tests (100ms/50ms) could flake on slow CI; linedTopics keeps module-level lib signature (deviates D64 wording).
- Task 7 committed 739c280 (pushed). Reviewer found Tasks 4-6 need fixes (R65, I1-I5); helpers were rate-limited and resumed 2026-11-10 20:50 UTC.
- R66 (owner message "finish this web tool with the minimum requirements and checks"): scope cut to a minimum shippable product. KEEP: data-layer fixes R65, Task 8 backup/restore, kit overlays/controls needed, app shell, create campaign + safety, Home, Settings (safety, export/restore, danger zone), Codex index + create/edit/detail with wiki links, plus a real Forge page (roll any generator under the campaign safety, lock/reroll, save to Codex), offline PWA. DROP/DEFER: Task 9 Markdown vault export, All campaigns page, Connections tab/Pull anything UI, History tab, Prep interview (S4), Table Mode ledger/sessions (S3), wrap-up/shortlist, in-memory fallback/banners (S5 except what the checks need). CHECKS kept: lint, typecheck, test, coverage, e2e + axe + 44px + overflow + privacy, clean-clone, real CI green, one final reviewer for safety and data-loss. Per-task reviewer loops replaced by ONE review per phase. Cost if wrong: features the spec listed are missing at launch; all additive later.
- R67: minimum-cut plan docs/superpowers/plans/2026-11-10-mvp-min.md (M1-M12, a87d13c) adopted. Owner questions answered by default: Forge returns to TopBar (reverses D27), no All campaigns page (Home lists campaigns), host-agnostic hosting config. Waves: W1 M1||M2; W2 M3,M6,M7,M8 (M4 after Task 8); W3 M5,M9; W4 M10,M11; M12 last. One review per phase. Ledger for this plan: .superpowers/sdd/2026-11-10-mvp-s2-codex/ (same folder).
- Task 7 (739c280) and Task 8 (0afd686) done and pushed; Task 9 skipped (R66). Backlog notes: remove unused fflate dependency in M11 (dependency + licence notice); backup naming a culture this build lacks is rejected (decide in M5/M4: drop unknown cultures with a notice rather than reject); Task 8 had no red-first run (mutation proof accepted).
