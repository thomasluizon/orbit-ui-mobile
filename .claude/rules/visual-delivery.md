---
paths:
  - "apps/web/**/*.{tsx,ts,css}"
  - "apps/mobile/**/*.{tsx,ts}"
  - "packages/shared/src/theme/**/*.ts"
---

# Visual delivery & anti-fabrication of "done"

**At a glance:** 8 standing rules that make completeness STRUCTURAL for any visual/redesign/transformation task (a page, a screen, a "de-slop", a "make it beautiful", a whole-app pass). Read this the moment a task's success is judged by how a rendered surface LOOKS rather than by a passing test. Judgement-bound but artifact-enforced. See `README.md` for the tier's contract.

## Why this tier exists (the #539 post-mortem, 2026-07-18)

Every gate here is *subtractive*: it proves bad things are absent and is blind to the absence of good ones. #539's b5 passed 100% of them by redoing one view and deleting decorations, then reported "the design applied" while the calendar, every modal, search, and the profile pages were untouched. **A claim of visual completion is worthless without a per-surface artifact, and green gates are never that artifact.**

## Before you start

### 1. Enumerate every surface first — the inventory IS the scope
A visual task's first deliverable is a **complete, checked-in list of every surface it must touch**: every route/page, every modal / dialog / sheet / drawer, every distinct empty / loading / error state, and each one's mobile mirror. Derive it from the code (`find … page.tsx`, `*-modal.tsx`, `*-dialog.tsx`, `*-sheet.tsx`, `*-drawer.tsx`), not from memory. **"Redesign the app" is not a scope; a numbered list of 40 surfaces is.** Anything not on the list is out of scope by omission — so the list must be exhaustive, and a surface discovered later is added to the list, not silently skipped.

### 2. Split "remove slop" from "add taste" — they are different deliverables
**Removal** (delete glow/gradient, clear warns, kill banned tokens) is subtractive and gate-checkable. **Taste** (hierarchy, spacing rhythm, restraint, alignment, the size/weight of the focal element, a button that hugs instead of stretching) is additive and judgement-bound. Bundling them is precisely what lets the checkable half stand in for the whole. Track and verify them **separately**; "warns at zero" is never evidence that taste was added.

## While you work

### 3. Never verify against a trivial database — seed the fixture first
A visual verification against an empty or one-row DB is **structurally invalid** and must not be run or reported. Seed representative data FIRST. The session seeds it itself. A surface you cannot populate cannot be verified. Say so, and do not glance at an empty screen and call it PASS.

### 4. Done = an artifact per surface PLUS a human grant, not a sentence
For each surface on the inventory, "done" means a **screenshot of the rendered surface, seeded, in light AND dark** (`npm run surfaces:capture`, or a browser-tool capture), attached to the ticket or PR (the D7 evidence gate), and a HUMAN saying so. No screenshot means not done; a machine judge cannot grant completion (D13: deterministic signals may withhold, never grant; the deleted vision judge scored 0/12 recall against the known human-found defects). On a PR, attach or link the artifacts so 40 thumbnails can be scanned in a minute instead of a paragraph being trusted.

## Before you claim done

### 5. A self-reported PASS is a RED flag, not a green one
If the only evidence that a surface is finished is prose you wrote ("looks good", "matches the mockup", "vision-verify PASS"), it is **unverified by definition**. Evidence is an artifact (a screenshot, a diff, a reviewer verdict against a named `file:line`) or it does not exist. Treat your own "PASS" as a claim to be disproven, never as a result.

### 6. Green gates are not completion
Lint, type-check, and the `local/*` rules prove that banned things are absent and nothing is broken. They say **nothing** about whether a surface got better. "All gates green" closes a *removal* task; it never closes a *taste* task. Do not let a green CI line stand for a design that was never looked at.

### 7. Adversarial completeness before close — prove it is NOT done
Before declaring a visual task complete, run a critic whose only job is to **falsify the completion claim**: given the surface inventory + the mockups + `DESIGN.md`, find surfaces that are still default-styled, labels that wrap, buttons that stretch full-bleed on desktop, spacing that is off-rhythm, or icons that are still the old set. Loop until the critic returns nothing new across two consecutive passes (loop-until-dry). This is the refutation pattern - which the harness already applies to *correctness* - applied to *completeness*, which it did not. **The wired mechanism is the `completeness-critic` agent** (read-only, fed the inventory + the changed-file list); its findings withhold completion, and only a human grants it (D13).

### 8. Surface the gap honestly, always
If you transformed 8 of 40 surfaces, the status is "8/40", not "the design pass is done." Never let the finite, checkable slice you finished be reported as the whole. Under-delivery stated plainly is recoverable; under-delivery disguised as completion is the exact failure this tier was written to stop, and it reads as lying even when it wasn't intended as one.
