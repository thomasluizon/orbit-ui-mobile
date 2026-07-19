---
issue: 539
title: "Whole-app visual transformation to DESIGN.md + mockups (web + mobile)"
status: in-progress
next-action: "Stage 1 - demo-critical slice. See '## The plan' below."
---

# Drive spec - #539 whole-app visual transformation

Lean, live spec. Full history in `issue-539.spec.archive.md`. This file was rewritten
2026-07-19 (afternoon) after a four-lens council + three adversarial refuters audited the
overnight run. Read `## What we learned` before proposing any change to the approach - it
records what has already been tried and refuted, and every claim in it was verified
first-hand.

## What we learned (2026-07-19, verified)

The earlier post-mortem (the harness "failed open" at every point) was correct and its fix
shipped. Tonight's failures were NEW and different. In order of how much they explain:

1. **The metric measures the wrong construct.** The passing verdict is called `transformed`
   but it grades **absolute conformance to DESIGN.md**, not change. Proof:
   `apps/web/app/(app)/explore/page.tsx` is **byte-identical to the pre-#539 baseline
   `7d7c42c3`** and scored `transformed` on both votes, while nine genuinely-redesigned
   surfaces scored `broken`. The judge is never shown a "before", so it structurally cannot
   tell "we transformed this" from "this was already acceptable".
2. **The denominator is not the app.** `.claude/manifests/surfaces.json` has **zero**
   `apps/mobile` cells - all 224 are `apps/web`, at a single 1280x900 viewport, with theme
   and locale axes but **no state axis**. So 224/224 would still leave mobile (451 files,
   85,209 lines - larger than web) entirely unverified, and would never photograph an empty
   state, a hover state, or a narrow viewport.
3. **The gate was shredding status lines.** The Stop hook exited 2 on any epic-wide
   shortfall, i.e. every turn. In a headless `claude -p` child it rejected the final message,
   forced a continuation, and the driver then parsed the continuation instead of the
   `{"status":...}` line. Three bundles were logged `unknown`; `social` had already
   committed, pushed and reported honestly. The circuit breaker then halted a healthy run.
4. **A judge call cannot fit inside a child's turn.** One `surfaces:judge` call blocked up to
   30 min against a 600s Bash ceiling, so children "paused to await" a notification that a
   single-shot process can never receive. A prompt warning cannot fix a resource mismatch.
5. **The gate recedes as you work.** Cells go `stale` on **source-file mtime** and verdicts
   are sha256-bound, so editing a shared component un-verifies many surfaces at once - i.e.
   the metric decays under exactly the DRY behaviour CLAUDE.md mandates. Observed live: the
   ratio moved 16 -> 20 -> 19 -> 20 in fifteen minutes with nobody editing.

**What is NOT wrong:** the judge is satisfiable (28% per-vote, 24% worst-wins `transformed`,
64% inter-rater agreement) and the surfaces that passed are exactly where real work was done.
It also found genuine bugs no human reported: a **broken paywall** (`route-upgrade`:
*"Payment service temporarily unavailable"*, PlanCards never render), a pt-BR page rendering
English chrome, and a double page title it cross-referenced to the human defect log by number.
**Do not loosen the judge threshold.** Its error profile is complementary to a human's, not
redundant with it.

**Refuted, do not re-propose:**
- *Pivot to a mobile-only clip set.* Mobile is larger than web and has **no manifest, no
  capture, no judge**. It is the same job with the instrument deleted.
- *Just report two numbers honestly.* That sentence already exists in prose inside the gate;
  its only measured effect was destroying a status line. Prose is not a gate.
- *Narrow the denominator and call it done.* Under a 7-surface denominator, b5's false "done"
  would have been **nearly true**. The 224 is what made b5's failure visible.

## Harness fixes LANDED this session (all code, all tested)

| commit | fix |
|---|---|
| `3d743d61` | Dollar budgets removed for good. Runs are bounded by `perTaskTimeoutMs`, the circuit breaker, and `.claude/drive/STOP`. Work is on a subscription; USD caps measured a number never spent and could kill a healthy bundle mid-flight. |
| `b238d3a2` | Stop gate is now an **honesty gate**: it blocks only a turn that claims the visual work is done without stating the ratio, and is silent otherwise. Driver derives task status from **side effects** (new commits + open PR) when the status line is missing. Stashes carry the bundle id. PRs open **ready for review**, never draft, so CI and the review bots actually run. |
| `d26392eb` | Judge runs batches **concurrently** (`--concurrency`, default 4). A 56-surface sweep drops from ~2.8h to well under an hour at identical token cost. Verified against a hermetic fake-judge harness; all fail-closed paths intact. |

`node .claude/hooks/test-hooks.mjs` is green, including a new case asserting the
anti-shredding property (shortfall + no completion claim -> exit 0).

## Definition of done (TWO numbers, forever, never one)

Every report, PR body, and issue comment states both:

- **Demo-critical: N/N** - the surfaces a user or a demo clip actually sees. This is the
  **blocking** gate for calling #539 shippable.
- **Epic-wide: N/224** - the full web manifest, computed by `node tools/check-surface-coverage.mjs`.
  This is **reported, never renumbered**. Mobile is currently outside it; say so explicitly
  rather than implying 224 is the whole app.

Never speak the narrow number without the wide one. The honesty gate enforces this
mechanically for any message claiming completion.

## The plan

**Stage 0 - unblock the merge path (do first, ~30 min).**
- orbit-api **#419** is `APPROVED` + `CLEAN` and now ready for review. **Merge it first.**
  `packages/shared/src/types/gamification.ts:67` requires `levelTitleKey`, which the deployed
  API does not return, so ui#560 breaks production until #419 deploys. This is the
  deploy-API-first rule.
- Then clear ui#560's **26 unresolved review threads** and land it. It is `MERGEABLE`, 65+
  commits, 700+ files. Every extra bundle makes it harder to review.
- Add `orbit-api` to `.claude/drive/config.json` `repos` so cross-repo bundles cannot orphan
  the API half again.

**Stage 1 - the demo-critical slice (one attended run).**
Tier A surfaces plus the paywall: `view-today`, `view-all`, `view-general`, `view-goals`,
`route-calendar`, `route-chat`, `route-social`, `route-explore`, `route-onboarding`,
`route-login`, `overlay-create-habit-modal`, `route-upgrade` (**fix the broken paywall - it is
a launch blocker, not a taste gap**). Bar: fresh capture + independent `transformed` verdict,
plus Thomas's own eyes once on the contact sheet.

**Stage 2 - close the honest gap on the rest of web**, in per-surface units, reporting the
ratio each time. No overnight run longer than one queue.

**Stage 3 - mobile.** Requires building the mobile half of the pipeline first (extend
`surface-manifest.mjs` beyond `apps/web`, and a native capture path). Until that exists,
**mobile parity is verified by review, and the spec says so out loud** rather than implying
coverage that does not exist.

## The acceptance test for the harness itself

Before trusting any future "the harness is fixed" claim, run the gate **twice on an unchanged
tree**. If the two answers differ, it is not a gate, it is a coin flip. The judge fails this
today (the calendar bundle's own words: *"oscillates partial across judge runs"*). A pixel
diff and an import count both pass it by construction - which is why the durable fix is to
verify **delta** (the repo already has `.github/workflows/visual.yml` + committed Playwright
baselines) and keep the LLM judge as a **defect detector**, never a completion oracle.

## Durable decisions (still binding)

- **Tokens (frozen):** accent `#8659EA` (`primary-soft` `#B69BF8`, `primary-dim` `#8659EA2E`,
  pressed `#6E44D2`); canvas `#070910`, surfaces `#111319`/`#16181E`/`#1F2128`; hairline
  `#FFFFFF14`. No decorative glow, no gradient wash, hairline dividers only.
- **Habit list:** one tonal panel per top-level habit, 2 levels inline + violet drill-in,
  `MAX_INLINE_DEPTH = 2`, kebab menu stays, colour emoji stay.
- **Mockups:** `KQMPM` (desktop) / `N8aEDF` (mobile) define the visual LANGUAGE, not the
  control set. **They are never passed to the judge** - a known gap.
- **Icons:** Tabler via the shared `<Icon>` barrel. Never import lucide again.
- **b9** (repo-wide suppression-directive ban) is a SEPARATE epic. Not part of this.

## Open defects to fold in
- Broken paywall on `route-upgrade` (functional, launch-blocking).
- The orphaned back-chevron / missing NavHeader title: **one shared-layout fix that unblocks
  up to 9 surfaces** (`preferences/page.tsx:83`, `ai-settings/page.tsx:100` pass `title=` to
  `AppBar` yet render no title on desktop).
- The 12 human-found defects in `issue-539-user-found-defects.md`. Most are **structurally
  invisible** to the capture pipeline (empty states are unreachable under the seeded fixture;
  the command palette and the onboarding wizard are not manifest surfaces at all). Fix them
  from the list, not from the gate.
- `route-r-code` captures the wrong page entirely (a judge graded the wrong page as `partial`).
- 3 overlays have no opener (`overlay-profile-modals`, `overlay-invite-confirm-sheet`,
  `overlay-rail-drawer`) = 12 permanently uncapturable cells until openers exist.
