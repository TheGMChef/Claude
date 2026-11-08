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
- **No duplicates in spirit.** If two entries would lead to the same scene, cut one.

## Original writing only

Write everything yourself. Don't copy or lightly reword text from any published game, book,
website or generator, even a single table entry, and don't paste in AI output you haven't
rewritten in your own voice. Common single words (oracle meanings like "betray" or "debt") are
fine. All content is licensed CC-BY-4.0 (see `LICENSE-CONTENT`), so only contribute what you have
the right to license that way.

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
When unsure, tag it. A missing tag can put something in front of a player who asked not to see
it. An extra tag only makes an entry a little rarer.

| Entry                                                        | Safety tags      | Why                                    |
| ------------------------------------------------------------ | ---------------- | -------------------------------------- |
| gravedigger                                                  | `death`          | the job is about death                 |
| a prayer cord wound around one wrist                         | `religion`       | a faith detail, however small          |
| someone else to take the blame for the granary fire          | `fire`           | the hook is a fire                     |
| watch sergeant near the end of a long shift                  | `police`         | town watch counts as police            |
| a soldier's coat with the badges cut off                     | `war`            | implies military service and desertion |
| their memory is slipping, and they keep notes in their boots | `mental-illness` | cognitive decline                      |
| a crooked nose and a very straight back                      | (none)           | a description, not an injury scene     |
| to know why the well water has started tasting sweet         | (none)           | a mystery with no harm implied         |

Keep the pack usable for groups with strict lines. No more than about 30% of any table should
carry safety tags, so the generator always has plenty of untagged entries to choose from.
Entries tagged `child-harm` are blocked by default in every new campaign, so don't write them for
this pack.

## Cultures

Each culture needs a voice summary, exactly three voice tips the GM can do straight away, at least
8 curated example names, and name parts that pass the `weak-culture` lint (20 distinct names).
Make cultures sound different from each other, with different sounds and letter clusters and
not just different lists. Use `banned` patterns (case-insensitive) to reject results that break
the culture's sound.

## Before you open a pull request

Run `pnpm content:lint`. It must pass with no output.
