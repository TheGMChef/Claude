# Status: the minimum viable product, checked off

Updated 2026-11-14. This is the lock-down list: the product is done when every box below is ticked.

## Definition of done (the minimum viable product)

- [x] Create a campaign with session-zero safety (lines and veils).
- [x] Forge: pick any of the 15 generators, Roll, hold fields, Roll again, Save to Codex, all under the campaign's current safety.
- [x] Codex: list, search, open an entry, delete an entry.
- [x] Settings: edit safety (applies at once), download a backup, restore from a backup, delete the campaign.
- [x] Works offline as an installable web app; nothing leaves the device.
- [ ] Edit an entry's text and wiki links in the UI (data layer done; page still to build).
- [ ] Home polish: list of campaigns and a restore button on the first-run screen.
- [ ] README ("Run and deploy", what is and is not in this release) and `_redirects` for hosting.
- [ ] One final safety and data-loss review pass.

## Proof (verified, not claimed)

- Unit tests: 1,327 passing. E2E: 237 passing across tablet, desktop and phone widths, including the full journey
  (create campaign, roll, hold, roll again, save, search, open, delete), accessibility (44 px targets, no horizontal
  scroll), and privacy (no third-party requests).
- GitHub Actions on the branch is the final word; check the latest run.
- Screenshots of the working app: see the conversation, or run `pnpm --filter web dev` and open `/`.

## Deliberately not in this release

Markdown export, All campaigns page, Connections tab, Mod+K palette, History tab, Prep interview, Table Mode,
wrap-up and shortlist, storage fallback banners. See `docs/superpowers/plans/2026-11-10-mvp-min.md` (B1 to B16).
