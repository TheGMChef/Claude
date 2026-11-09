# Contributing to the fantasy pack

This pack is the first content GMs see. Tables are small on purpose. Every entry has to be good,
because a GM reads it out at the table with five people waiting.

## What a good entry looks like

- **One breath.** An entry is at most one short sentence. If you need a comma and a second clause,
  check that the GM still gets the idea at a glance.
- **Specific and evocative.** "a coat two sizes too big, pockets clinking" beats "shabby clothes".
  Give the GM a detail they can perform or point at.
- **Playable.** `want` and `secret` entries are hooks. The party should be able to help with them,
  get in the way, or exploit them. "to repay the moneylender before the debt passes to their
  children" gives the GM a scene. "to be happy" doesn't.
- **Fits the slot.** Entries read as fragments that finish a sentence, so start them in lower case:
  roles complete "a …" (no article, because the generator adds one: "eel-trap mender"), wants
  complete "They want …", secrets complete "Secretly, …", tells complete "They always …".
- **Tone.** Grounded, a little wry, never grimdark for its own sake. Darker material is fine when
  it makes a hook stronger and it is tagged (see below).
- **Title stem (slot grammar).** Each table's `title` states the sentence it completes, for
  example "Rumor: People say that …". Write every entry to read aloud after that stem.
- **No duplicates in spirit.** If two entries would lead to the same scene, cut one. This also
  holds across `rumor.text` and `secret.text`, which the gates check as one pool.
- **No exclamation marks, no "you"** (except encounter `fail` and `turn`), and free-text context
  (`{ctx.pc.want}`, `{ctx.truth.text}`) only at the very end of an entry, always with an `or:`
  fallback.

## Original writing only

Write everything yourself. Don't copy or lightly reword text from any published game, book,
website or generator, even a single table entry, and don't paste in AI output you haven't
rewritten in your own voice. Common single words (oracle meanings like "betray" or "debt") are
fine. All content is licensed CC-BY-4.0 (see `LICENSE-CONTENT`), so only contribute what you have
the right to license that way.

**Originality check.** For every table you write or extend, pick its most distinctive entries
(across the tables of one task, 15 phrases in all), search each verbatim in quotes on the web, and
confirm no published match. Rewrite any hit. Avoid proper nouns from published settings and system
terms such as gp, hit points or DCs.

## Tags

- `tags` are free-form helpers (`urban`, `rural`, `coastal`, `wilderness`, `debt`, `family`,
  `faith`, `crime`, `trade`, `magic`, `noble`). Every tag must be declared in
  `src/vocabulary.yaml`, or the linter fails with `unknown-tag`. Add a new tag only when at least
  a few entries would use it.
- `safety` tags come from the fixed safety vocabulary and nothing else: violence, gore, death,
  torture, sexual-content, abuse, child-harm, self-harm, suicide, addiction, slavery, body-horror,
  insects, spiders, rats, drowning, fire, claustrophobia, religion, hate-bigotry, animal-harm,
  pregnancy, mental-illness, police, war.

## Safety tagging

Groups use lines (never show this) and veils (show it, but fade to black). These only work if
**every entry that touches a topic carries its safety tag**, including mild or indirect mentions.
When unsure, tag it. One borderline call: gambling, wagers and card games
are untagged, but compulsion ("can't stop betting") is `addiction`. A missing tag can put something in front of a player who asked not to see
it. An extra tag only makes an entry a little rarer.

| Entry                                                        | Safety tags      | Why                                    |
| ------------------------------------------------------------ | ---------------- | -------------------------------------- |
| gravedigger who talks to the newly buried                    | `death`          | the job is about death                 |
| a prayer cord wound around one wrist                         | `religion`       | a faith detail, however small          |
| someone else to take the blame for the granary fire          | `fire`           | the hook is a fire                     |
| watch sergeant near the end of a long shift                  | `police`         | town watch counts as police            |
| a soldier's coat with the badges cut off                     | `war`            | implies military service and desertion |
| their memory is slipping, and they keep notes in their boots | `mental-illness` | cognitive decline                      |
| a crooked nose and a very straight back                      | (none)           | a description, not an injury scene     |
| to know why the well water has started tasting sweet         | (none)           | a mystery with no harm implied         |

Keep the pack usable for groups with strict lines. No more than about 30% of any table should
carry safety tags (the gates fail above 30%), so the generator always has plenty of untagged
entries to choose from. Rewrite an entry to drop a topic rather than dropping a tag that belongs.
Entries tagged `child-harm` are blocked by default in every new campaign, so don't write them for
this pack.

## Cultures

Each culture needs a voice summary, exactly three voice tips the GM can do straight away, at least
8 curated example names, and name parts that pass the `weak-culture` lint (20 distinct names).
Make cultures sound different from each other, with different sounds and letter clusters and
not just different lists. Use `banned` patterns (case-insensitive) to reject results that break
the culture's sound.

**Names and voice notes.** Culture `examples` and voice `tips` must not touch any safety topic.
The `culture-safety` lint rejects words from the short per-topic stem list in
`packages/engine/src/safetyStems.ts`. Generated names carry no safety tags. Never rename a name
the owner wrote to get past the lint; fix the stem list instead. The counts above stay as they are
until the cultures are raised to 16 examples and 4 tips each.

## Situations

A situation is a tag pair: a title that names a tension, with six facets that fill in a scene.
Two situations rolled together make a seed. Each lives in `src/situations/<slug>.yaml`, with its id
under `<pack>.situation.`, and lists `situation` first in its `tags`.

| Facet          | What it holds                                         |
| -------------- | ----------------------------------------------------- |
| `enemy`        | a person or group, plus what they want                |
| `friend`       | a person or group who would help, plus what they want |
| `complication` | the knot that makes acting costly                     |
| `thing`        | an object someone wants                               |
| `place`        | a location with a reason to be there                  |
| `pressure`     | what happens if nobody acts, with a when              |

- Each facet needs at least 4 entries once the situations are full (3 while they are a starter set),
  written as fragments in the same style as table entries.
- **Title rule.** Two or three words, our own, and unique. The summary is one sentence of at most
  120 characters ending with a period.
- **Safety.** Facet entries inherit the situation's `safety` tags, so tag the situation itself
  when its whole premise touches a topic. Keep title-level tags rare: at least half of the
  situations must survive the strict-lines fixture, and no facet may hold more than one strict-lined
  entry of its own.
- **Originality check.** Search each title and the five most distinctive lines verbatim before
  committing, and rename any match or near match (plural, synonym swap) of a published tag list.

## Quality gates

These run on every change to the pack, driven by one table: `packages/engine/test/fixtures/content-spec.ts`.
A content task edits only that table (counts, `full` flags, kinds). Run them with:

```
pnpm --filter @prepdesk/engine test packs content
```

- **Counts.** Every `TABLE_SPEC` table exists and has at least its threshold: the target once
  `full`, otherwise the stub (default 8). `fixed` tables have exactly the target. The deck, the
  oracle meaning tables, the situations and the cultures have their own counters.
- **Strict lines.** At most 30% of a table is safety-tagged. Under the strict-lines fixture a
  table loses at most 40%, and Pocket-feeding tables keep at least 12 eligible entries once full.
  Situations keep enough eligible entries and facets hold at most one strict-lined entry.
- **Lines of text.** No `!`. Line entries are at most 110 characters, start in lower case (or with
  a slot), do not end with `.` or `,`, and no two share their first three words. Word entries are
  short (at most 20 characters, two words), unique and lower case (Title Case when marked `caps`).
  Pattern entries contain a slot.
- **Articles.** Any table read through a `{table|a}` slot has no entry starting with `a`, `an`,
  `the`, `one`, `hour`, `honest`, `honour`, `heir`, `uni…` or `eu…`.
- **Context slots.** Every `ctx` slot has an `or:` fallback and a path from the allowed list;
  free-text keys come last.
- **Safety audit.** Every word in a safety stem list that appears in an entry must have that
  entry's tag. A genuine false positive ("stablehand" for `stab`) needs a row with a reason in
  `AUDIT_EXCEPTIONS`; "fireplace" is not one, so tag or reword it.
- **Tags.** Each family's tag is on its tables, terrain tables cover every terrain tag, and every
  vocabulary tag is used somewhere.
- **Situations and cultures.** Titles are unique and 2-3 words, summaries are short sentences,
  and cultures have their example and tip counts.
- **Generation.** Each generator rolls 1,000 times with no missing reference, empty field or
  warning, matches its determinism snapshot, and reads cleanly under DM-shaped and blank context.
  Ten thousand random generations under random lines and veils never show a lined source.

## Auditing a table for safety tags

Do this for every table you touch (the Content Task Protocol audit):

1. Print the sheet: `tsx packages/engine/test/tools/audit-list.ts fantasy.npc` (a table id or an
   id prefix; several allowed). Each row shows the entry, its tags, its stem hits and the hits it
   lacks a tag for.
2. Read every entry against all 25 topics, not just the stem hits. Tag anything that touches a
   topic, including mild or indirect mentions. When unsure, tag it.
3. Keep each table at 30% tagged or less by rewriting entries, never by dropping a tag.
4. Add an `AUDIT_EXCEPTIONS` row only for a true false positive, with its reason.

## Before you open a pull request

Run `pnpm content:lint` (no output) and the quality gates above.
