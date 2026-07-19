---
issue: 539
title: "Whole-app visual transformation to DESIGN.md + mockups (web + mobile)"
status: in-progress
next-action: "Thomas ticks surfaces in signoff.json after looking at a contact sheet. See '## How a surface actually gets done'."
---

# Drive spec - #539 whole-app visual transformation

Rewritten 2026-07-19 (evening) after the harness rebuild. The previous version of this file
described a harness that has since been replaced. The full record of the rebuild - the
research, the citations, and the two mechanisms that were prototyped and refuted - lives in
the brain vault as `Orbit harness rebuild - the three-axis visual gate (#539)`; the
keep-prune-replace survey that ran alongside it is `Orbit harness keep-prune-replace research
2026-07-19 (#539)`. Both are under `brain/2 Areas/20-29 Orbit Engineering/`. The refuted
mechanisms are also summarised in full below, so this file stands alone.

**Read `## Refuted, do not re-propose` before proposing any change to the approach.**

## The single most important thing

**Nothing automatic can mark a surface done.** Not the judge, not a lint pass, not a
screenshot. The only axis that grants completion is a human tick in
`.claude/manifests/signoff.json`, which agents are structurally blocked from writing.

This is not caution, it is the measured conclusion. The judge scored `route-explore` -
byte-identical to the pre-#539 baseline - as `transformed` on both votes, and its recall
against the 12 known human-found defects is **0/12**. The published evidence agrees: MLLM UI
judges score F1 20.4% on text overflow and 31.2% on collision (UI-Lens, CVPR 2026), sit near
chance when two screens are close in quality (arXiv 2510.08783), and need >=11 votes for 95%
reliability where this harness used 2 (arXiv 2606.13685).

## How a surface actually gets done

A cell is DONE only when all three hold. Two can only withhold; one grants.

| axis | meaning | direction |
|---|---|---|
| `touched` | an owned file's **visual signature** differs from baseline `7d7c42c3` | veto only |
| `defectClear` | an independent judge report exists for the cell, pinned to that signature, with no **blocker** finding | veto only |
| `signed` | a human tick in `signoff.json` | **the only grant** |

The loop:

```bash
npm run surfaces:manifest    # regenerate the denominator (visible git diff)
npm run surfaces:capture     # screenshots for the surfaces the live stack can reach
npm run surfaces:judge       # defect detection -> .claude/manifests/defects.json
npm run surfaces:sheet       # contact sheet for a human to look at
npm run surfaces:check       # the oracle: three numbers + scope, deterministic
npm run surfaces:calibrate   # what the judge's clean sweep is actually worth
```

`node tools/check-surface-coverage.mjs --explain <surfaceId>` prints the whole evidence trail
for one surface.

## Current state (measured 2026-07-19)

```
0/804 cells DONE (touched AND defect-clear AND human-signed)
  touched       604/804   an owned file's visual signature moved since 7d7c42c3
  defect-clear    0/804   independent judge report on file, no blocker
  human-signed    0/804   the ONLY axis that grants completion
SCOPE: 804 cells = 171 surfaces x state x theme x locale
  mobile     0/348  cells done   (NO pixel pipeline exists for React Native)
  web        0/456  cells done
```

The denominator went **56 -> 171 surfaces** (99 web + 72 mobile). It was widened, never
narrowed: the only source file dropped is `profile-modals.tsx`, a pure aggregator with no
pixels of its own whose four children are each their own surface now.

`defect-clear` reads 0 because the judge's output format changed and no sweep has been run
against the new one yet. That is real work outstanding, not a display bug.

## What the harness does NOT do (honest list)

1. **It cannot tell you the app looks good.** No available instrument can. It can only make it
   impossible to *claim* the app looks good without a human having looked.
2. **Empty / loading / error states are enumerated but not captured.** The manifest carries 120
   `empty` cells; `capture-surfaces.mjs` reports them as `state-not-capturable` rather than
   filling them with a populated screenshot. Reaching them needs the hermetic mock-api harness
   (`apps/web/e2e/visual/`), which is not wired to this manifest.
3. **Mobile has no pixel evidence at all**, because no cheap deterministic RN pipeline exists
   (Chromatic RN is early-access not GA; Maestro defaults to a 95% match threshold; Detox and
   Owl need native builds and have open animation-flake issues). Mobile is covered by the
   static axes plus human sign-off, and every output line says so.
4. **`touched` is defeatable by a deliberate no-op sweep** (adding `data-x=""` everywhere).
   That only clears a veto; it grants nothing.
5. **The baseline is single-use.** After #539 merges, "changed since `7d7c42c3`" stops meaning
   anything until it is re-pinned. It is printed on every run so a stale baseline is visible
   rather than silent.
6. **The manifest does not self-regenerate.** `generatedFrom` can lag HEAD; re-run
   `npm run surfaces:manifest` after adding surfaces.

## Refuted, do not re-propose

- **The judge as a completion oracle.** Measured 0/12 recall, and it passed an unchanged
  surface twice. Keep it as a defect detector; do not restore its grant power.
- **Feeding the judge the known-defect list.** It was in the prompt until 2026-07-19, which
  made recall unmeasurable - one recorded finding quotes "known defect #2" *by number*.
- **A whole-import-closure hash as the "did work happen" signal.** Prototyped and refuted:
  `route-explore`'s closure is 167 files, 20 of which changed via the shared app shell, so it
  reported CHANGED. Everything reaches everything through the shell.
- **A source-TEXT diff as that signal.** `prettier --write` across `apps/` flips every surface
  in one commit. The signature must be render-affecting tokens only.
- **Ownership recomputed at check time.** It is a global property, so an unrelated second
  surface importing a shared file silently un-owns it and moves a third surface's status with
  nobody editing. Ownership is frozen in the committed manifest.
- **mtime or PNG-sha256 as the invalidation model.** Both made DRY work decay the metric.
- **A per-surface lint/conformance axis.** Lint already gates merge in CI; re-checking it
  per-surface duplicates an existing gate and passes for free on surfaces that never had
  violations.
- **Pivoting to a mobile-only clip set.** Mobile is larger than web and has no capture path.
- **"Just report two numbers" as prose.** It already existed as a sentence in the gate and its
  only measured effect was destroying a drive child's status line. The tool now prints its
  scope on every run and `test-hooks` asserts it.
- **Narrowing the denominator.** Under a 7-surface denominator the earlier false "done" would
  have been nearly true. The wide number is what made the failure visible.

## Durable design decisions (unchanged)

- **Tokens (frozen):** accent `#8659EA` (`primary-soft` `#B69BF8`, `primary-dim` `#8659EA2E`,
  pressed `#6E44D2`); canvas `#070910`, surfaces `#111319`/`#16181E`/`#1F2128`; hairline
  `#FFFFFF14`. No decorative glow, no gradient wash, hairline dividers only.
- **Habit list:** one tonal panel per top-level habit, 2 levels inline + violet drill-in,
  `MAX_INLINE_DEPTH = 2`, kebab menu stays, colour emoji stay.
- **Mockups:** `KQMPM` (desktop) / `N8aEDF` (mobile) define the visual LANGUAGE, not the
  control set. They are never passed to the judge - a known gap.
- **Icons:** Tabler via the shared `<Icon>` barrel. Never import lucide again.

## Open defects to fold in

- Broken paywall on `route-upgrade` (functional, launch-blocking) - found by the judge, which
  is the kind of thing it is genuinely good for.
- The orphaned back-chevron / missing NavHeader title: one shared-layout fix across up to 9
  surfaces.
- The 12 human-found defects in `issue-539-user-found-defects.md`. **5 of the 12 are
  structurally invisible** to the capture pipeline (empty states, the command palette in its
  open state, the onboarding wizard steps). Fix them from the list, not from the gate.
