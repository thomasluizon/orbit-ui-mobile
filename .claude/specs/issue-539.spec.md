---
issue: 539
title: "Whole-app visual transformation to DESIGN.md + mockups (web + mobile)"
status: in-progress
next-action: "/drive 539 - resume the attended run. Bundle table below; B1 ran 2026-07-23, B2 (web-route-5805b8be) is approved and queued."
---

# Drive spec - #539 whole-app visual transformation

## Bundles (this session's approved slice)

Approved at the Phase A gate on 2026-07-23: 2 web route bundles, sonnet tier. Web-only is
deliberate - web is the only platform with a capture path, so `claude-in-chrome` vision-verify
is real evidence rather than theatre. The full queue holds 48 debt-carrying bundles; these two
are the slice, not the whole.

| # | bundle id | surface | tier | debt | files | status | PR |
|---|---|---|---|---|---|---|----|
| B1 | `web-route-56d279c7` | `route-streak` (`/streak`) | sonnet | 19 | 4 | ready-for-review (driver said `failed`, see below) | #574 |
| B2 | `web-route-5805b8be` | `route-calendar-sync` | sonnet | 17 | 7 | approved, queued | - |

**B1's recorded `failed` status is an operator artifact, not a defect in the child's work.**
The ownership gate measures `--head <sha>` **plus the uncommitted working tree** (it prints
`+ uncommitted working tree` in its own header). This file was edited mid-run, so the gate
counted `.claude/specs/issue-539.spec.md` as a changed file outside `route-streak`'s boundary
and exited 1. Re-run on the child's own branch, with the working copy matching the commit, the
identical command exits **0**: `every changed file is owned by this work order or structurally
permitted, and no gate state moved`. The child's 7 files are the 4 owned sources plus the two
regenerated ledger files (rule 7) plus `eslint-suppressions.json` (rule 3), and its
`route-streak.md` was verified **byte-exact** against a fresh `node tools/workorder.mjs`.

## Lesson candidates (promote via /lesson)

- **Never edit ANY tracked file in the repo while a drive child is running.** The existing rule
  was "no local git during a run"; that is too narrow. `check-diff-ownership` reads the
  uncommitted working tree, so an operator edit to an unrelated file lands inside the child's
  measured diff and fails an honest bundle. Cost here: B1 recorded `failed`, fed the
  consecutive-failure circuit breaker, and produced a lesson candidate for a bundle that had
  actually done its job correctly. Park edits in the scratchpad, or commit them before launch.

Run artifacts: `.claude/drive/b1/runs/<stamp>/` (per-bundle dirs under the gitignored
`.claude/drive/`). Orca provenance: task `task_a2438b3e0fa6` (Phase A, completed), gate
`gate_c0ef1733aefd` (resolved), B1 `task_f0be80002038`, B2 `task_96c9682d6a33`.

## Reconcile log

- **2026-07-23** - resumed. Corrected three stale claims in this file: the merge is committed
  (`6a2e1136`), not in progress; both "known, not yet fixed" test failures pass; the work-order
  ledger was stale and was regenerated + committed (`52348783`). Queue rebuilt to 48 bundles,
  preflight green, B1 launched.
- **2026-07-23** - measured, unchanged by any of the above: `0/804 cells DONE`; 37 of 168
  surface orders at 0% depth, 159 below the 30% floor.
- **2026-07-23** - established that **Orca orchestration has no human-facing UI**. Tasks and
  gates are agent-facing runtime state reachable only by CLI/RPC; the app's "Tasks" panel is a
  GitHub/Jira issue browser, and the accessibility tree carries no gate/inbox/decision surface
  (confirmed against the running app and the published docs). Drive gates therefore stay in the
  terminal; Orca records them for provenance only.

## Where this stands (2026-07-23)

**The harness now lives on `main`.** PR #570 was squash-merged as `56c6605f` after six
independent review rounds, each of which found a real defect (nine numbered gate-tamper
bypasses now carry regression tests, 766 assertions). `tools/workorder.mjs`,
`check-diff-ownership.mjs`, `drive-queue.mjs`, `surface-manifest.mjs`, `visual-signature.mjs`
and `.claude/skills/drive/run.mjs` are all on main, so `/drive` works for any issue rather
than only this one.

**That merge is now COMMITTED as `6a2e1136`** (2026-07-23 12:41 -0300); `.git/MERGE_HEAD` is
gone and the tree is clean. All 191 conflicts were resolved across 297 files. How each class
was resolved:

| class | resolution |
|---|---|
| 11 app-code conflicts | union of both sides, one agent per file, then three adversarial verifiers |
| 160 `.claude/workorders/*` + `surfaces.json` | derived - took main's, then regenerated from the merged tree |
| 9 differing harness/doc files | main (they carry the bypass fixes, fail-closed guard, `**` gitignore idiom) |
| both `eslint-suppressions.json` | ours - the real design debt; main's `{}` was a port placeholder |
| `test-mocks/lucide-react-native.ts` | stays deleted - the b6 icon-barrel migration replaced it with `tabler-icons.ts` |
| `habit-create.png` | ours, but **the baseline is stale and must be regenerated** - both sides changed the create-habit form |

**The three fixes that shipped to production while this branch was open all survived**,
verified line-by-line rather than assumed: #568 (`onScrollOffsetChange`, never the discarded
`onScroll`, plus the corrected test mock and the `local/no-draggable-onscroll` rule), #569
(`useSheetExitAction` / `onDidDismiss` sheet-navigation deferral), and #566 (sub-habit
frequency mirroring + scroll-to-top). The one surviving `onScroll=` in `habit-list.tsx` is on
a plain `FlatList`, which honours it correctly.

**The two merge-introduced test failures this file used to list are RESOLVED.** Both were
re-run 2026-07-23 and pass: `habit-row.test.tsx` 10/10 and `calendar-views.test.tsx` 6/6. The
whole monorepo suite is green - **313 files, 2605 tests, exit 0**. (Note for whoever reads
this next: `apps/mobile` runs **Vitest**, not Jest. Invoking `npx jest` there produces a
spurious "cannot be imported in a CommonJS module" failure that looks like a real regression
and is not one.)

**The work-order ledger was stale after the merge and has been regenerated** (commit
`52348783`). All 214 orders still carried `generatedFrom: 48e4496e`; a fresh regeneration
differed on 216 files, so CI's ledger-freshness gate would have failed and `drive-queue` was
packing bundles from a stale ledger. The diff was provenance-only - no Timeline entry, debt
count or ownership moved.

**The harness has now been driven for real.** Queue rebuilt with `--only-debt` to 48
debt-carrying bundles; `run.mjs --dry-run` passes. Bundle 1 (`web-route-56d279c7`,
`route-streak`) was run attended on 2026-07-23 through an isolated single-entry runtime dir
(`--dir .claude/drive/b1`), which is the supported way to run one bundle: the engine is
unmodified, so base-sha pinning, `measureChildWork` and driver-derived status all still hold.

Rewritten 2026-07-19 (evening) after the harness rebuild. The previous version of this file
described a harness that has since been replaced. The full record of the rebuild - the
research, the citations, and the two mechanisms that were prototyped and refuted - lives in
the brain vault as `Orbit harness rebuild - the three-axis visual gate (#539)`; the
keep-prune-replace survey that ran alongside it is `Orbit harness keep-prune-replace research
2026-07-19 (#539)`. Both are under `brain/2 Areas/20-29 Orbit Engineering/`. The refuted
mechanisms are also summarised in full below, so this file stands alone.

**Read `## Refuted, do not re-propose` before proposing any change to the approach.**

## Edited is not redesigned (2026-07-19, the correction that mattered most)

`touched` was a boolean: any changed file flipped it true. So a surface with four
edited lines reported exactly what a rebuilt screen reported, and ten drive runs
said "done" while Thomas opened the calendar and found it unchanged. **He was
right every time.** Measured against baseline `7d7c42c3` across all 171 surfaces:

| depth of change | surfaces |
|---|---|
| 0% (byte-identical) | 42 |
| under 5% | 57 |
| 5-15% | 53 |
| 15-30% | 10 |
| 30-60% | 7 |
| 60%+ | 2 |

**89% of the app had moved less than 15%** while the oracle reported 608/804 cells
touched. `route-calendar` was 9.6% across 12 files. `view-today` was **0.0%** -
byte-identical to the pre-#539 baseline.

`touched` now requires the surface's render-affecting token stream to differ by
`REDESIGN_DEPTH_FLOOR` (30%, override with `ORBIT_REDESIGN_DEPTH`). The count went
608 -> **48/804**. A shallow cell now fails with its measured percentage rather
than passing silently:

> `too-shallow: only 9.6% of this surface's render-affecting content changed since
> 7d7c42c3 (floor 30%); 9 file(s) edited. Edited is not redesigned.`

This is a **veto**, not a grant: a large mechanical sweep can clear it. It only
answers "did anyone actually do the work here", which is the question that has to
be settled *before* a human is asked to look at anything.

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
| `touched` | **at least 30%** of the surface's render-affecting content moved since baseline `7d7c42c3` | veto only |
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

### `route-streak` - observed live in both themes, 2026-07-23 (B1's untouched Backlog B)

Captured through `claude-in-chrome` against the local stack on B1's branch. B1's spacing pass
changed none of this, which is what a depth of 11.2% looks like in practice.

- **Colour emoji used as stat iconography.** The Estatisticas cards carry a trophy and a medal
  emoji. DESIGN.md mandates Tabler glyphs through the shared `<Icon>` barrel; the standing
  "colour emoji stay" decision covers HABIT emoji, not decorative stat glyphs. This is the
  AI-slop test's central example.
- **Card as a layout primitive.** Three stacked cards run down one column (Estatisticas 2-up,
  Esta Semana, Congelamento de sequencia). The work order's own Backlog B names this: "A card
  is not a layout primitive."
- **Two cards carrying one scalar each** ("0 / Maior", "Normal / Classificacao"). Very low
  information density for the vertical space consumed.
- **The orbital glyph above the streak count is near-invisible**, in light theme especially.
  It is meant to be identity-carrying under the de-decorated anchor, and instead reads as an
  artifact.
- **Confirms the known orphaned back-chevron defect on this route**: the chevron sits alone
  below the top bar while the bar carries the page title separately.
- **Large empty right-hand region at desktop width** (content column roughly 600px centred in
  ~1280px). Expected from a mobile-first 412px shell, but worth a deliberate decision rather
  than an accident.

- Broken paywall on `route-upgrade` (functional, launch-blocking) - found by the judge, which
  is the kind of thing it is genuinely good for.
- The orphaned back-chevron / missing NavHeader title: one shared-layout fix across up to 9
  surfaces.
- The 12 human-found defects in `issue-539-user-found-defects.md`. **5 of the 12 are
  structurally invisible** to the capture pipeline (empty states, the command palette in its
  open state, the onboarding wizard steps). Fix them from the list, not from the gate.
