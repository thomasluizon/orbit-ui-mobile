# Visual delivery & anti-fabrication of "done"

**At a glance:** 8 standing rules that make completeness STRUCTURAL for any visual/redesign/transformation task (a page, a screen, a "de-slop", a "make it beautiful", a whole-app pass). Read this the moment a task's success is judged by how a rendered surface LOOKS rather than by a passing test. Judgement-bound but artifact-enforced. See `README.md` for the tier's contract.

## Why this tier exists (the #539 post-mortem, 2026-07-18)

Orbit's harness is superb at enforcing the **absence of bad things** — `no-decorative-glow`, `no-raw-gradient`, `no-arbitrary-zindex`, the em-dash and AI-cliché hooks are all *subtractive* gates. It is **blind to the absence of good things.** You can pass 100% of the gates by deleting decorations and never make one surface tasteful. #539's b5 did exactly that: it cleared the lint warnings and redid the Today view, passed every gate, and was reported as "the design applied" — while the calendar, every modal, the buttons, search, and the profile pages were **untouched**. The one check that could have caught it (vision-verify) was self-reported, so it was faked against a one-task database and written up as "PASS."

**The lesson, in one line: a claim of visual completion is worthless without a per-surface artifact, and green gates are never that artifact.** These rules exist so a model inclined to reach a stopping point cannot pass the whole system on 5% of the work.

## Before you start

### 1. Enumerate every surface first — the inventory IS the scope
A visual task's first deliverable is a **complete, checked-in list of every surface it must touch**: every route/page, every modal / dialog / sheet / drawer, every distinct empty / loading / error state, and each one's mobile mirror. Derive it from the code (`find … page.tsx`, `*-modal.tsx`, `*-dialog.tsx`, `*-sheet.tsx`, `*-drawer.tsx`), not from memory. **"Redesign the app" is not a scope; a numbered list of 40 surfaces is.** Anything not on the list is out of scope by omission — so the list must be exhaustive, and a surface discovered later is added to the list, not silently skipped.

### 2. Split "remove slop" from "add taste" — they are different deliverables
**Removal** (delete glow/gradient, clear warns, kill banned tokens) is subtractive and gate-checkable. **Taste** (hierarchy, spacing rhythm, restraint, alignment, the size/weight of the focal element, a button that hugs instead of stretching) is additive and judgement-bound. Bundling them is precisely what lets the checkable half stand in for the whole. Track and verify them **separately**; "warns at zero" is never evidence that taste was added.

## While you work

### 3. Never verify against a trivial database — seed the fixture first
A visual verification against an empty or one-row DB is **structurally invalid** and must not be run or reported. Seed the standard fixture FIRST (see `## The seed fixture` below): a 3-level habit family + a childless habit + a long-string habit (to force wrap/overflow) + gamification data + both locales reachable. A surface you cannot populate cannot be verified — say so, don't glance at an empty screen and call it PASS.

### 4. Done = an artifact per surface PLUS an independent judge verdict, not a sentence
For each surface on the inventory, "done" means a **screenshot of the rendered surface, seeded, in light AND dark**, PLUS an **independent vision-judge verdict of `transformed`** recorded by `npm run surfaces:judge` (a fresh read-only model process that reads the pixels and `DESIGN.md`, hash-bound to the exact PNG bytes). No screenshot → not done. Screenshot but no judge verdict, or a verdict of `partial`/`default`/`broken` → not done. `tools/check-surface-coverage.mjs` computes this; the Stop gate (armed by default while `surfaces.json` exists) enforces it. On a PR, attach or link the artifacts so 40 thumbnails can be scanned in a minute instead of a paragraph being trusted.

## Before you claim done

### 5. A self-reported PASS is a RED flag, not a green one
If the only evidence that a surface is finished is prose you wrote ("looks good", "matches the mockup", "vision-verify PASS"), it is **unverified by definition**. Evidence is an artifact (a screenshot, a diff, a reviewer verdict against a named `file:line`) or it does not exist. Treat your own "PASS" as a claim to be disproven, never as a result.

### 6. Green gates are not completion
Lint, type-check, and the `local/*` rules prove that banned things are absent and nothing is broken. They say **nothing** about whether a surface got better. "All gates green" closes a *removal* task; it never closes a *taste* task. Do not let a green CI line stand for a design that was never looked at.

### 7. Adversarial completeness before close — prove it is NOT done
Before declaring a visual task complete, run a critic whose only job is to **falsify the completion claim**: given the surface inventory + the mockups + `DESIGN.md`, find surfaces that are still default-styled, labels that wrap, buttons that stretch full-bleed on desktop, spacing that is off-rhythm, or icons that are still the old set. Loop until the critic returns nothing new across two consecutive passes (loop-until-dry). This is the refutation pattern - which the harness already applies to *correctness* - applied to *completeness*, which it did not. **The wired mechanism is `npm run surfaces:judge`**: it spawns the adversarial judges itself and its verdicts feed the oracle directly, so the critic loop is the same loop that flips cells to verified - capture → judge → check, until `surfaces:check` exits 0.

### 8. Surface the gap honestly, always
If you transformed 8 of 40 surfaces, the status is "8/40", not "the design pass is done." Never let the finite, checkable slice you finished be reported as the whole. Under-delivery stated plainly is recoverable; under-delivery disguised as completion is the exact failure this tier was written to stop, and it reads as lying even when it wasn't intended as one.

## The seed fixture (the precondition rule 3 enforces)

The standard visual-verification fixture, seeded before ANY vision pass on Orbit. **The drive session seeds it ITSELF — this is never a manual step you hand to the human.** The autonomous path needs no token and no env change: the local browser is already signed in, and the web BFF (`app/api/[...path]/route.ts`) proxies authenticated requests to the API. So from the logged-in `localhost:<web>` page, drive `javascript_tool` to `fetch('/api/habits', { method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body })` for each fixture habit (and `POST /api/habits/{id}/sub-habits` for nesting) — the httpOnly cookie rides along and the BFF attaches the bearer. `tools/seed-visual-fixture.mjs` is only the **headless fallback** for a renderless box. **Any local setup either path needs is the session's OWN job — never a step handed to the human.** The session controls the local stack, so if the fallback needs a token it sets `TEST_ACCOUNTS=email:code` on the local API and restarts `dotnet run` itself, then logs in via the auth flow (`SendCode` returns the fixed code for that email) to mint the bearer. Setting a local env var, restarting a local process, seeding data — all within the session's power, so the session does them. "Enable X" or "run Y" told to the human is the exact punt this tier forbids: if you *can* do it with a tool you have, you do it. It must produce, for the signed-in account:

- **A 3-level habit family** — e.g. `Water` → `Morning` → `Big glass` (which itself has children, so the drill affordance appears at the third tier). This exercises the habit-list panels, the two-inline-levels + drill, and the indentation at every depth.
- **A childless top-level habit** (single-row panel) and a **recurring habit with a checklist** (multi-row) — so both panel shapes render.
- **A long-title habit** (~60 chars) and a **long-description habit** — to force wrap/overflow and prove strings don't blow out tracks or wrap labels (DESIGN.md measure + `min-width:0` rules).
- **Gamification populated** — a streak, a level with XP progress, ≥1 unlocked + ≥1 locked achievement — so the rail, the ring, and the profile stat tiles render with real numbers, not zeros.
- **Some scheduled + some overdue + some completed** occurrences across the current month — so the calendar month/week/agenda views show dots, states, and a non-empty day.
- **Reachable in both `en` and `pt-BR`** — every surface is verified in both locales (pt-BR runs ~30-40% longer and is where labels wrap).

A vision pass that runs without this fixture present is invalid under rule 3 — re-seed, then verify.
