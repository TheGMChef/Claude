# Prep Desk: Product Brief v1 (for approval)

**Date:** 2026-11-08 · **Status:** Draft for review. Not yet the spec.
**Look & feel sample:** https://claude.ai/artifact/QBuwwnGsQtnqzgmr2sjiyZ (private canvas: Table Mode, Prep Desk interview in dark mode, style tile)

---

## 1. What I heard (your answers, condensed)

| Topic | Decision |
|---|---|
| Audience | Experienced, improv-heavy DMs first, but welcoming to new DMs and solo players (oracle) |
| Business | Free community site to start; monetization analysed below for later |
| Systems | System-agnostic core + optional **system packs** (stat blocks, encounter balancing) |
| Genres | Five most popular genres, built on a genre-neutral engine |
| Look | Clean, modern, hand-drawn; warm paper, index cards, a DM's desk. Light + dark |
| 6-month goal | First 1,000 users; expansion packs start ~6 months after launch |
| #1 moment | **Live at the table.** Prep exists to load the table tools |
| Prep style | A quick **interview** with thoughtful questions; ≤6 steps, ~5 min each, ≤30 min total; can go longer if wanted |
| Device | **Tablet first**; works everywhere |
| Offline | Partial: once prepped, a session runs without a connection |
| AI | **None at launch.** Smart, rule-based assembly. Test versions later; cost analysis below |
| Memory | Pull up any information at any time, across the whole campaign. Everything wiki-linked |
| Accounts | Accounts and cloud sync, done smartly |
| Content | Small, carefully written tables. Names from sound rules plus curated examples, **with voicing notes per culture** |
| User tables | Users can **always** create, edit, include or delete anything |
| Shortlist | Anything generated can be locked into the session or put on a **Shortlist** for the next prep |
| Improv → log | Everything improvised at the table goes to the session log **and** comes back in post-session review and the next prep ("Recurring NPC? Flesh out now or later?") |
| Launch modules | Improv kit, names, NPCs, settlements, taverns & shops, dungeons, adventure seeds (tag pairs), secrets & clues, complications, oracle + GM moves, **trinkets & treasure** |
| Combat | Narrative encounter cards in core; stat blocks **and full encounter balancing** in system packs |
| Maps | Simple hand-inked, hatched old-school dungeon maps (original style, no copying) |
| Players | "Maybe": printable/shareable handouts; live player view later |
| Safety | Always built in |
| Exports | Everything: PDF, Markdown/Obsidian, JSON; Foundry and others as add-ons |
| Content license | Open: anyone can use generated content and the tables |
| Name | **Prep Desk** |

### Assumptions I made (please correct)
- **The five genres:** Fantasy (launch), Sci-fi / space opera, Horror (gothic + cosmic), Cyberpunk, Modern supernatural / investigation. Post-apocalyptic is the first expansion candidate.
- **"Prep Desk"** is the product name. The modes inside it: *Prep* (the interview), *Table* (live), *Codex* (everything you know), *Forge* (all generators and your own tables).
- **Full encounter balancing** is system-specific, so it lives in system packs (5e first, via SRD 5.2, CC-BY-4.0).
- **"Lock & reroll"** means: every generated card is made of fields (name, want, secret, voice…). Tap a padlock on the fields you like and reroll changes only the rest. Each result also has a short **seed code**, so the same roll can be recreated or shared.

---

## 2. The core loop

```
   ┌────────────── PREP (≤30 min interview) ──────────────┐
   │ 1 The Table  2 Last Time  3 The Pressure             │
   │ 4 The Opening  5 Truths & Places  6 The Pocket       │
   └───────────────┬──────────────────────────────────────┘
                   ▼  answers become cards: rumors, clues, scenes, NPCs
   ┌────────────── TABLE MODE (live) ─────────────────────┐
   │ Pocket (pre-rolled kit) · Spread (scene cards)       │
   │ Ledger (auto-log) · Dock (1-tap generators, Stuck?)  │
   └───────────────┬──────────────────────────────────────┘
                   ▼  every use / improvisation is stamped in the Ledger
   ┌────────────── WRAP-UP (2 min, right after) ──────────┐
   │ Triage improvised things → Keep / Shortlist / Let go │
   │ Auto-drafted recap · clue status · clocks            │
   └───────────────┬──────────────────────────────────────┘
                   ▼
              CODEX (wiki of everything) ──► feeds next PREP
```

### The six interview steps (original, informed by Lazy DM / Alexandrian / PbtA)
| # | Step | What it asks (examples) | What it produces |
|---|---|---|---|
| 1 | **The Table** | Who's coming? Which character hasn't had the spotlight? What does each one want right now? | Spotlight hooks per PC |
| 2 | **Last Time** | Here's what was improvised: keep, shortlist or let go? What did the players care about most? | Promoted NPCs and places, carried-forward threads |
| 3 | **The Pressure** | If nobody interferes, what does each threat do this week? | Clock ticks; drafted rumor + clue + scene per answer |
| 4 | **The Opening** | Where does the game start, already in motion? What 2–4 scenes *might* happen? | Strong start card, scene cards |
| 5 | **Truths & Places** | What could they learn? (aim ~10; the desk warns when a conclusion has fewer than 3 clues). Where might they go? | Secret/clue cards; location cards with 3 aspects |
| 6 | **The Pocket** | Review the auto-rolled improv kit: lock, reroll, add | Tonight's Pocket (names by culture + voice notes, NPCs, places, rumors, complications, treasure, meaning pairs) |

Each step has: a short *why we ask*, a text answer, **nudges** (roll a villain move, pull from the shortlist, show the clock), and **drafted cards** (Keep / Edit / Toss). That's the "information flows from the DM" part, done with templates and tags instead of AI.

---

## 3. How the generators work without AI ("smart assembly")

1. **Tables** of short, hand-written entries, each with *tags* (genre, tone, culture, safety tags such as `gore`, `child-harm`, `spiders`).
2. **Grammar templates** with slots: `{name} the {role}, who wants {want}, but {secret}.`
3. **Context inheritance:** a tavern generated *inside* Saltmere inherits its culture, tags and active fronts, so names fit and rumors mention real campaign threats.
4. **Campaign-aware slots:** templates can pull from your Codex (`{active_front.name}`, `{unrevealed_clue}`), so generic output becomes your campaign's output.
5. **Constraints:** no repeats; a **distinctiveness guard** (avoids a first letter or sound already used by a recent NPC); safety filters (lines & veils remove tagged entries).
6. **Name phonology:** each culture defines syllable parts and patterns plus curated examples, and a **voicing note** ("slow vowels, drop the final g, never says no").
7. **Seeded randomness:** reproducible rolls, lock and reroll, shareable seeds.
8. **Your tables are first-class:** your edits and new tables use the same format and can be shared.

---

## 4. Build approaches

| | **A. Local-first web app (PWA)** ★ | B. Server-rendered web app | C. Native tablet app |
|---|---|---|---|
| What | Static site that installs on a tablet, keeps data on the device, syncs to the cloud when signed in | Classic app with a database server; online only | iPad/Android app |
| Offline at table | ✅ Full | ❌ Weak | ✅ Full |
| Running cost | ~$0 to start | Grows with users | Store fees, two codebases |
| Speed to build | Fast | Fast | Slow |
| Risk | Sync conflicts (manageable: one DM per campaign) | Breaks on bad Wi-Fi, which is exactly the table moment | App store friction, slower iteration |

**Recommendation: A.** It matches "the tool runs itself once prepped", costs nothing to host at 1,000 users, and can be wrapped as a store app later if needed.

### Proposed stack (A)
- **App:** TypeScript + React + Vite, installable PWA (works offline after first load).
- **On-device data:** IndexedDB via Dexie, so the whole campaign lives on the tablet.
- **Accounts + sync (later milestone):** Supabase (auth + Postgres). Free tier: 50,000 monthly active users, 500 MB database, 5 GB egress, **pauses after a week of inactivity**, which won't happen once there's steady traffic. Pro is **$25/month** when needed.
- **Hosting:** a free static host (Cloudflare Pages, Netlify or GitHub Pages). I'll confirm current limits at setup.
- **Content:** tables as YAML/JSON files in the repo, licensed **CC-BY-4.0**; community additions via pull request plus an in-app "submit a table".
- **Exports:** client-side PDF (print-ready Pocket, session sheet, handouts), Markdown with Obsidian-style `[[links]]`, JSON backup; Foundry export as a later add-on.

---

## 5. Cost & monetization analysis

### Running costs without AI (launch)
| Users | Hosting | Database/sync | Domain | **Total** |
|---|---|---|---|---|
| ≤1,000 | $0 | $0 (free tier) | ~$1–2/mo | **≈ $2/mo** |
| ~10,000 | $0–20 | $25 (Pro) | ~$2 | **≈ $30–50/mo** |

### If an AI "flesh this out" button is added later
Assumes ~2,500 tokens of campaign context in and ~600 tokens out per press. Current Claude API prices per million tokens (input/output): Haiku 5.5 $0.10/$0.50 · Sonnet 5.5 $2/$10 · Opus 5.5 $4/$20.

| Model | Cost per press | 1,000 users (30% use it, 40 presses/mo) | 10,000 users |
|---|---|---|---|
| Haiku 5.5 | ~$0.00055 | **~$7/mo** | ~$66/mo |
| Sonnet 5.5 | ~$0.011 | ~$132/mo | ~$1,320/mo |
| Opus 5.5 | ~$0.022 | ~$264/mo | ~$2,640/mo |

**Takeaway:** a Haiku-tier "flesh out" button is cheap enough to give paying supporters generous use. Bigger models only make sense on a paid tier or with users bringing their own API key.

### Monetization path (when ready)
1. **Free forever:** every core generator, Table Mode, Prep interview, local storage, exports.
2. **Supporter tier (~$4–6/mo, in-app subscription):** cloud sync across devices, unlimited campaigns, early access to expansion packs, AI "flesh out" (if tests prove it's worth it).
3. **Expansion packs:** genre packs, system packs, themed table packs, either one-off purchases or included for supporters. Community packs stay free.
4. Lesson from Owlbear Rodeo: they found Patreon posts pulled time away from the product and moved to an in-app subscription. **Recommendation:** in-app subscription, not Patreon.

Break-even at ≈$30–50/mo needs about **8–12 supporters**.

---

## 6. UI direction: "Ink & Index" (what the research said, and how the sample applies it)

| Research finding | How it shapes Prep Desk |
|---|---|
| Hand-drawn UI is a 2026 counter-trend to AI polish, and works best used **sparingly** (rough underlines, sketched icons, paper texture) | Type and layout stay crisp and modern. Only the "ink" is hand-drawn: wobbly card outlines, highlighter strikes, margin notes, rubber stamps, clocks, maps. Ink never sits over words |
| Cultist Simulator's "everything is cards on a table" is praised for immersion but criticised for clutter and lack of snapping | Cards on a desk, but in **fixed zones** (Pocket · Spread · Ledger · Dock). No free-floating mess |
| LegendKeeper and Owlbear Rodeo are praised for clean, low-friction, start-instantly UIs | Minimal chrome; one primary action per card; no setup to start a session |
| Kanka's "web of connections" is a standout feature | The Codex gets a relationship web (NPC ↔ faction ↔ place ↔ clue) |
| DMs need recall more than invention | **Use = Log:** tapping a Pocket name strikes it with highlighter, annotates its role and stamps it in the Ledger |
| Tablet at the table | Dock at the bottom within thumb reach; 44px+ touch targets; "Pull anything" search on `/` |

**Type:** Bricolage Grotesque (names, headings) · Instrument Sans (read-aloud text) · Shantell Sans (your handwriting: notes, voices) · JetBrains Mono (time, dice, counts).
**Palette (day / night):** paper #F3EDE1 / #191714 · card #FFFDF8 / #24201B · ink #1F1B16 / #EFE8DB · pencil blue #2F4BA0 / #93A9F2 · highlighter #F6D55C / #E8C25A · stamp red #B23A26 / #F08C78.

---

## 7. Sub-projects & build order

| # | Sub-project | Ships |
|---|---|---|
| 0 | **Foundations**: repo, design tokens, Ink & Index component kit, PWA shell, light/dark | Clickable shell |
| 1 | **Content engine**: table format, grammar, tags, seeded RNG, lock/reroll, name phonology + voicing, distinctiveness guard, safety filter | Engine + tests |
| 2 | **Fantasy core pack + launch generators**: names, NPCs, settlements, taverns & shops, adventure seeds, secrets & clues, complications, treasure & trinkets, oracle + moves deck, encounter cards | **M1 "Pocket alpha"**: printable improv kit |
| 3 | **Codex**: data model, wiki links, universal search, relationship web, local storage | Campaign memory |
| 4 | **Table Mode**: Pocket, Spread, Ledger, Dock, Stuck?, clocks | **M2 playable at the table** |
| 5 | **Prep interview + Wrap-up + Shortlist** | **M3 the full loop** |
| 6 | **Dungeons & maps**: 5-room generator + hand-inked map renderer | Maps |
| 7 | **Accounts & sync, exports** (PDF, Markdown, JSON), handouts | **M4 public beta** |
| 8 | **Safety tools**: session zero, lines & veils wired into the content filter | (built alongside 1–5, polished here) |
| 9 | **5e system pack**: SRD 5.2 stat blocks + encounter balancing | Launch |
| 10 | **Genres 2–5 + community contribution pipeline** | Launch → +6 months |
| 11 | Post-launch: expansion packs, Foundry export, player view, AI experiments | Growth |

Each sub-project gets its own short spec → plan → build cycle.
