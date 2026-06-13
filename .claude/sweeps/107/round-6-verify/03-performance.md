# Round-6 verify — Sweep #3 Performance (static) — issue #107

READ-ONLY. Baselines: ui-mobile **1dd5c3d** (committed green), orbit-api **fcfdc95**. Static reading + grep of the r6 diff; every cited line re-read in the current tree. No browsers/Lighthouse (DEF-1). Verifies the two round-5 LOW carryovers landed in round 6 and the API perf set still holds.

## Round-5 LOW carryovers — both RESOLVED in round 6

- **web loading-bar `background-position` → transform.** `apps/web/app/globals.css` r6 diff: `.loading-bar` now `position: relative; overflow: hidden`, the gradient moved onto a **`.loading-bar::after`** pseudo (`width: 200%`, `inset: 0`), and `@keyframes loading-slide` rewritten from `background-position: 200%/−200%` to `transform: translateX(-50%)` → `translateX(50%)`. The animated property is now `transform` (compositor-only, no per-frame gradient repaint) — exactly the round-3/round-5 prescribed fix. RESOLVED.
  - The only remaining `background-position` in web (`globals.css:565` `right 12px center`) is a **static** select-arrow position, not an animated keyframe. Not a finding.
- **mobile tour-scroll handler gated on tour-active.** `apps/mobile/hooks/use-tour-scroll-container.ts` r6 diff: subscribes `const isTourActive = useTourStore((s) => s.isActive)` and `onTourScroll` now early-returns `if (!isTourActive) return` before `tourScrollRegistry.updateScrollY(...)`; dep array updated to `[isTourActive, route]`. The per-scroll-frame registry write on the four hot surfaces (`(tabs)/index`, `calendar`, `profile`, `habit-list`) now no-ops unless a tour is active. RESOLVED.

## API perf — unchanged, still fixed

`git diff --name-only fcfdc95 HEAD` in orbit-api: not applicable (api at fcfdc95, untouched in this FE r6 commit). The four round-3 perf fixes confirmed at round-5 (SkipHabit single-skip filtered include, SkipHabit `SyncStreakGoals` filtered ThenInclude, BulkDeleteUserFacts batch, AssignTags/CreateHabit per-tag-name N+1) all remain in `fcfdc95`. No regression possible from a frontend-only commit.

## r6-introduced motion — compliant

The r6 reduced-motion gating (skeleton pulse, habit-row CheckCircle pop) and the goal-card `-text` migration introduce no new perf cost:
- skeleton pulse animates `opacity` (compositor), gated off entirely when `prefersReducedMotion`.
- CheckCircle pop animates `scale` (`transform`), gated off when `prefersReducedMotion`.
- Gating reduces work (skips the loop/sequence) — a net perf improvement on reduced-motion devices.

## Verdict

| Severity | Count |
|---|---|
| HIGH | 0 |
| MED | 0 |
| LOW | 0 |
| **Total** | **0** |

**ZERO FINDINGS.** Both round-5 LOW carryovers resolved in r6: the web loading-bar now animates `transform: translateX` on a 200%-wide `::after` (no more `background-position` repaint), and the mobile tour-scroll handler early-returns unless a tour is active. API perf unchanged (fcfdc95). r6's new reduced-motion gating is transform/opacity-only and reduces work. Net: round-5's 2 LOW → 0.
