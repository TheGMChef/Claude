# Page patterns by route

Recorded by the `ux-audit` pre-flight (VectorLab `page-patterns`, hard gate 8). Each screen names one
locked pattern, or says plainly that it has none. Update this note when a route is built for real.

| Route           | Pattern today                                         | Target when built (owner to confirm)                                                                       |
| --------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/`             | 4 - Dashboard / Overview (launcher; links out only)   | Same. Add status tiles (max five) only when there is real status to glance at.                             |
| `/prep`         | Temporary placeholder (`ModeShell`)                   | 3 - Form (wizard): six-step interview, sticky Back / Next, per-step validation.                            |
| `/table`        | Temporary placeholder (`ModeShell`)                   | Does not map cleanly: a live console (Pocket, scene, Ledger). Stop and ask before building (see below).    |
| `/codex`        | Temporary placeholder (`ModeShell`)                   | 1 - List / Index of campaign pages, then 2 - Detail / Record per page.                                     |
| `/forge`        | Temporary placeholder (`ModeShell`)                   | 1 - List / Index of generators, each opening a 3 - Form (page) or slide-over for its inputs.               |
| `/kit`          | None. Dev-only component gallery, absent in production | n/a                                                                                                        |
| `/forge-preview` | None. Dev-only engine harness, absent in production   | Retired by `/forge`.                                                                                       |

## Notes

- The placeholder is a deliberate stub, not a pattern. It names no catalogue pattern, has no create
  action and is scored as unfinished by `ux-audit` gate 10. It is acceptable only while the mode is
  unbuilt. Do not grow `ModeShell`; replace it per mode.
- Table mode is a live, editable, glanceable console. Dashboard (4) forbids editing, Analytics (9)
  needs a date range, Split Pane (8) is for triage. The catalogue says to stop and ask rather than
  invent an eleventh pattern, so the owner decides before Table is built.
- Never put a KPI strip on a list, and keep List / Board / Calendar views of the same records on one
  page with a toggle.
