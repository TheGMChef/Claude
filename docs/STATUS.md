# Status: the minimum viable product, checked off

Updated 2026-11-14. This is the lock-down list: the product is done when every box below is ticked.

## Definition of done (the minimum viable product)

- [x] Create a campaign with session-zero safety (lines and veils).
- [x] Forge: pick any of the 15 generators, Roll, hold fields, Roll again, Save to Codex, all under the campaign's current safety.
- [x] Codex: list, search, open an entry, delete an entry.
- [x] Settings: edit safety (applies at once), download a backup, restore from a backup, delete the campaign.
- [x] Works offline as an installable web app; nothing leaves the device.
- [x] Edit an entry's text, add wiki links, create a missing page straight from a link, create entries by hand.
- [x] Home lists your campaigns; Restore from backup on Home and Settings (tested: download, delete, restore).
- [x] README (run, deploy, what is and is not in this release) and `_redirects` for hosting.
- [x] Safety and data-loss checks: the Forge safety test (25 lines x 15 generators x 40 seeds, reroll and recheck,
      with a control that proves it can fail) and the backup, delete, restore journey. No independent reviewer pass was
      run for this minimum cut; it is the first thing to add before a public launch.

## Proof (verified, not claimed)

- Unit tests: 1,355 passing. E2E: 245 passing across tablet, desktop and phone widths, including the full journey
  (create campaign, roll, hold, roll again, save, search, open, delete), accessibility (44 px targets, no horizontal
  scroll), and privacy (no third-party requests).
- GitHub Actions on the branch is the final word; check the latest run.
- Screenshots of the working app: see the conversation, or run `pnpm --filter web dev` and open `/`.

## Deliberately not in this release

Markdown export, All campaigns page, Connections tab, Mod+K palette, History tab, Prep interview, Table Mode,
wrap-up and shortlist, storage fallback banners. See `docs/superpowers/plans/2026-11-10-mvp-min.md` (B1 to B16).
