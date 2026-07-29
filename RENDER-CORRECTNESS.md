# Render Correctness

**At a glance:** the single authority for self-critiquing rendered UI before a
`visible-effect` ticket reaches In Review, and for the seed fixture every vision
pass runs against. Read the captured pixels against `DESIGN.md`, apply the checks
below, and attach a Markdown critique beside the final screenshots. Stop after at
most three capture and critique iterations so a subjective review cannot consume
the worker's remaining budget.

`DESIGN.md` remains the visual authority. This file adds the correctness checks
that require looking at rendered output and defines the bounded evidence loop. It
does not replace `design-reviewer`, add another completion gate, or grant merge
authority.

## Current evidence coverage

`tools/capture-surfaces.mjs` currently:

- captures web only;
- covers light and dark themes in `en` and `pt-BR`;
- writes screenshots to `.artifacts/surfaces/`;
- captures only the default state produced by the seeded live stack.

Loading, empty, and error cells are not capturable through this live-stack path.
Mobile has no automated capture pipeline and has static plus human evidence only.
A critique must state these limits and must not describe an uncaptured state or
platform as pixel-verified.

## Required loop

1. Capture every changed surface in the available theme and locale matrix,
   including a 412px-wide capture for shell correctness.
2. Read every screenshot and judge it against the whole of `DESIGN.md` plus every
   check below.
3. Record the evidence, findings, and coverage gaps in one Markdown critique
   artifact inside `.artifacts/surfaces/`, alongside the screenshots.
4. Fix each finding that can be resolved within the ticket, then recapture and
   critique the affected surfaces.
5. Stop when an iteration is clean or after iteration 3. Three is a hard cap
   because a subjective render loop must leave enough budget to finish and report.
   At the cap, preserve every unresolved finding in the critique instead of
   continuing or attaching silently.
6. Attach the final screenshots and the critique artifact to the Linear issue
   before moving it to In Review.

An iteration is one capture followed by one complete critique. A clean first pass
therefore ends after one iteration without a revision.

## Render-correctness checks

- **Human-readable values:** no raw recurrence rule such as
  `FREQ=WEEKLY;BYDAY=MO`, ISO timestamp, enum member name, internal ID, or
  untranslated i18n key reaches user-facing output. Render the localized,
  user-recognizable meaning.
- **412px shell:** no text, control, dialog, menu, table, or other content clips,
  overlaps, escapes its container, creates unintended horizontal overflow, or
  hides a required action at 412px. Check both locales because `pt-BR` often
  expands copy.
- **Finished content:** no fixture placeholder, `Lorem ipsum`, `TODO`, `TBD`,
  mock label, or other authoring filler appears as shipped content.
- **State reachability:** loading, empty, and error states are each reachable and
  useful, as required by `DESIGN.md`. Record the evidence used for each state.
  When the live capture cannot render one, mark it as a coverage gap and use the
  available static or human evidence. Never treat the default-state screenshot as
  proof of the triad.

## Critique artifact

The critique must be specific enough for a reviewer to reproduce the worker's
judgment. Include:

- ticket, iteration count, screenshot paths, and the surfaces reviewed;
- themes, locales, states, viewport widths, and platforms actually covered;
- each finding, the evidence that exposed it, and the revision made;
- loading, empty, and error reachability with its evidence or stated gap;
- every unresolved finding and why it remains unresolved;
- a final result of `clean` or `unresolved findings`, without a numeric score.

For `parity:yes`, cover both web and mobile. Until mobile capture exists, review
the web pixels and provide the available mobile static plus human evidence. Name
the mobile capture gap explicitly. If any other platform cannot be examined,
state which platform was covered and why the gap remains.

## The seed fixture

Every vision pass runs against this fixture. A verification against an empty or
one-row database is structurally invalid (`.claude/rules/visual-delivery.md`
rule 3) and must not be run or reported.

**The session seeds it ITSELF, this is never a manual step handed to the human.**
The autonomous path needs no token and no env change: the local browser is already
signed in, and the web BFF (`app/api/[...path]/route.ts`) proxies authenticated
requests to the API. From the logged-in `localhost:<web>` page, drive
`javascript_tool` to `fetch('/api/habits', { method:'POST', credentials:'include',
headers:{'content-type':'application/json'}, body })` for each fixture habit (and
`POST /api/habits/{id}/sub-habits` for nesting), the httpOnly cookie rides along
and the BFF attaches the bearer. On a renderless box, make the same calls with
`fetch` from Node against the local API. If that fallback needs a token, the
session sets `TEST_ACCOUNTS=email:code` on the local API, restarts `dotnet run`
itself, then logs in via the auth flow (`SendCode` returns the fixed code for that
email) to mint the bearer. Setting a local env var, restarting a local process,
seeding data, all within the session's power, so the session does them.

It must produce, for the signed-in account:

- **A 3-level habit family**, e.g. `Water` → `Morning` → `Big glass` (which itself has children, so the drill affordance appears at the third tier). This exercises the habit-list panels, the two-inline-levels + drill, and the indentation at every depth.
- **A childless top-level habit** (single-row panel) and a **recurring habit with a checklist** (multi-row), so both panel shapes render.
- **A long-title habit** (~60 chars) and a **long-description habit**, to force wrap/overflow and prove strings don't blow out tracks or wrap labels (DESIGN.md measure + `min-width:0` rules).
- **Gamification populated**, a streak, a level with XP progress, ≥1 unlocked + ≥1 locked achievement, so the rail, the ring, and the profile stat tiles render with real numbers, not zeros.
- **Some scheduled + some overdue + some completed** occurrences across the current month, so the calendar month/week/agenda views show dots, states, and a non-empty day.
- **Reachable in both `en` and `pt-BR`**, every surface is verified in both locales (pt-BR runs ~30-40% longer and is where labels wrap).
