# Prep Desk

A free, tablet-first improv kit for tabletop game masters. Roll NPCs, places, taverns, shops, rumors, secrets,
clues, complications, treasure, encounters and adventure seeds, keep the ones you like in a campaign Codex, and
link them together. System-agnostic. No accounts, no AI, nothing leaves your device.

## What is in this release

- **Campaigns with session-zero safety.** Choose lines (never appear) and veils (off-screen only). They apply to
  every roll, always, and override locks.
- **The Forge.** 15 generators of original content. Roll, hold the fields you like, roll again, save to the Codex.
- **The Codex.** Save, search, open, edit and delete entries. Link entries with `[[double brackets]]`; a link to a
  page that doesn't exist yet offers to create it.
- **Backup and restore.** Download a JSON backup; restore it on this or another device. A restore is all-or-nothing.
- **Works offline** as an installable web app (a PWA). Light and dark themes. Tablet first, works on phones.

## Not in this release yet

Table Mode (live session tools), the six-step prep interview, session wrap-up and shortlist, Markdown export, the
quick-find palette, an entry history tab, a connections tab, and a few settings (name cultures, front clocks).

## Run it

Needs Node 22 and pnpm 10.

```
pnpm install --frozen-lockfile
pnpm --filter web dev          # http://localhost:5173
```

Checks (the same ones CI runs):

```
pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm content:lint
pnpm build
pnpm --filter web build:e2e && CI=1 pnpm e2e --trace off
```

## Deploy

`pnpm build` writes a static site to `apps/web/dist`. Any static host works. Cloudflare Pages and Netlify read the
two files in `apps/web/public`:

- `_headers`: the strict Content Security Policy and security headers (please keep them).
- `_redirects`: sends every path to `index.html` so deep links work.

Settings for either host: build command `pnpm install --frozen-lockfile && pnpm build`, output directory
`apps/web/dist`, Node 22.

## Your data

Everything lives in your browser (IndexedDB) on this device only. Clearing site data deletes it. Download a backup
from Settings now and then; that file is your safety net.

## Licence

Code and content are CC-BY-4.0 where original (see `LICENSE-CONTENT` in each content pack). Third-party licences
are in `THIRD-PARTY-NOTICES.md`.

## For contributors

Start with `docs/HANDOFF.md` and `CLAUDE.md`. Project status is `docs/STATUS.md`.
