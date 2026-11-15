# How to test Prep Desk

Three ways, from fastest to most real. Use the first one today.

## 1. Look at it right now (no setup beyond Node)

You need Node 22 and pnpm 10 (`npm i -g pnpm`), and a copy of the repo (branch `ccr-44bc3dc3-wdo7jt`).

```
pnpm install --frozen-lockfile
pnpm build
pnpm --filter web preview
```

Open the address it prints (usually http://localhost:4173) in Chrome, Edge or Safari. This is the real production
build, served with the same security headers a host would use. For live code changes use `pnpm --filter web dev`
(usually http://localhost:5173) instead.

## 2. A walk-through that touches everything (10 minutes)

Do these in order. Each step says what you should see.

1. **First run.** Open `/`. You see "Start your first campaign", a Create campaign button and Restore from backup.
2. **Create a campaign.** Click Create campaign. Type a name. Under Session zero, set a topic to **Line: never**
   (for example Spiders) and another to **Veil it** (for example War). Create campaign. You land on the Forge, and it
   says how many lines and veils it is rolling under.
3. **Roll.** Pick Instant NPC, press Roll. You see a card: a name, a role, a look, a want, a secret, a voice, a tell.
4. **Hold and Roll again.** Press the lock icon beside Name, then Roll again. Everything changes except the held name.
5. **Try the other generators.** Tavern, Shop, Rumor, Secret, Clue, Treasure, Encounter, Adventure seed, and so on.
   Names come from the culture you pick under Names from.
6. **Save.** Press Save to Codex. A line says it is saved, with an Open it link.
7. **Codex.** Open Codex in the top bar. Your entry is listed. Type part of its name in the search box. Type nonsense:
   you get "Nothing matches that" and a Clear the search button.
8. **Links.** Press New entry. Title "Marl Hollow's ferryman". In Notes write `Works for [[Odrin Vey]].` Create entry. On
   the detail page, "Odrin Vey" shows "Create “Odrin Vey”". Click it, create the entry, and you are returned to the
   ferryman with the name now a live link.
9. **Edit.** Open an entry, press Edit entry, change the summary, Save changes. Try leaving the form with unsaved text:
   it asks first.
10. **Safety changes.** Open Settings. Change a topic to **Line: never**. Go back to the Forge: the line count updated,
    and a card already on screen is re-checked.
11. **Backup and restore.** In Settings press Download backup (a `.json` file downloads). Press Delete this campaign and
    confirm. You are back at the first-run screen. Press Restore from backup, choose the file, confirm. Your campaign and
    entries are back.
12. **Dark mode and phone.** Press the sun/moon key in the top bar. Narrow the browser window to phone width: the top bar
    collapses into a Menu.
13. **Offline.** In Chrome open DevTools, Network, tick Offline, reload. The app still loads and works.

## 3. Test on a real tablet (after you deploy)

1. Deploy (see README, "Deploy"): Cloudflare Pages or Netlify, build command
   `pnpm install --frozen-lockfile && pnpm build`, output directory `apps/web/dist`, Node 22.
2. Open the address on the tablet in Safari or Chrome. Use "Add to Home Screen" to install it.
3. Turn on airplane mode and open the installed app: it should still work.
4. Check touch: every button should be easy to hit, and nothing should scroll sideways.

## Automated tests (what the project already runs)

```
pnpm lint && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm content:lint
pnpm build
pnpm --filter web build:e2e && CI=1 pnpm e2e --trace off     # real browser, four screen sizes
```

The e2e suite includes full journeys (create, roll, save, search, edit, back up, delete, restore), accessibility
(44 px touch targets, no sideways scroll), and a privacy check (no requests to other sites). GitHub Actions runs the
same checks on every push.

## Where your data lives

Everything is stored in the browser on that device (IndexedDB). A different browser or device starts empty. Clearing
site data deletes it. Use Download backup before you try anything risky.

## Known limits of this release

No Table Mode, Prep interview, wrap-up, shortlist, Markdown export or quick-find palette yet. Only the first 100 entries
are listed when you are not searching; use the search box beyond that.
