# Sweep #3 — Performance (static), issue #107 ROUND 5 (final verification)

Read-only. Baselines: ui-mobile `3520d10`, orbit-api `fcfdc95` (both committed green). Static reading + grep; every cited line re-read in the current tree. No browsers/Lighthouse (DEF-1). `npm audit --omit=dev` (12 moderate / 0 high — DEF-4/5) + `dotnet list package --vulnerable` (0 vulnerable, all 8 projects) re-run, both unchanged. Round-3 report + round-4-deferrals read first. Reports NEW or still-open NON-deferred only.

Format: `SEVERITY · file:line · rule · fix`.

---

## Round-4 fixes — verification (all round-3 perf MED CONFIRMED FIXED)

API (orbit-api), commit `fcfdc95`:
- **SkipHabit single-skip filtered include** (round-3 MED) — **FIXED**. `SkipHabitCommand.cs:29-30` now computes `today` + `loggableWindowStart = today.AddDays(-AppConstants.DefaultOverdueWindowDays)` BEFORE the load, and `:32` binds `Include(h => h.Logs.Where(l => l.Date >= loggableWindowStart))`. Exactly the sibling fix LogHabit/BulkSkip already carried.
- **SkipHabit `SyncStreakGoals` filtered ThenInclude** (round-3 MED) — **FIXED**. `SkipHabitCommand.cs:120` computes `streakWindowStart = today.AddDays(-AppConstants.MaxStreakLookbackDays)`; `:123` binds `.ThenInclude(h => h.Logs.Where(l => l.Date >= streakWindowStart))`. Direct parallel to LogHabit:244.
- **BulkDeleteUserFacts N+1** (round-3 LOW) — **FIXED**. `BulkDeleteUserFactsCommand.cs:24-27` replaced the per-`factId` `FindOneTrackedAsync`-in-`foreach` with a single `FindTrackedAsync(f => factIds.Contains(f.Id) && f.UserId == request.UserId, …)` + in-memory `SoftDelete()` loop. The batched precedent the round-3 LOW asked for.
- **AssignTagsTool / CreateHabitTool per-tag-name N+1** (round-3 LOW) — **FIXED**. `AssignTagsTool.cs:115-119` + `CreateHabitTool.cs:303-307` now build the capitalized-name set, issue ONE `FindTrackedAsync(t => t.UserId == userId && capitalizedNames.Contains(t.Name), ct)`, `.ToDictionary(…)`, then resolve from the dict. The two agent-tool N+1 loops are gone. Behavioral tests rewired to mock `FindTrackedAsync` (`AssignTagsToolTests.cs`, `CreateHabitToolTests.cs`, `UserFactCommandHandlerTests.cs`) so the batched paths are covered.

Frontend (orbit-ui-mobile), commit `3520d10`: the round-4 split commit (`useChatComposer`/`ChatPage`/`CalendarSync`) is a behavior-preserving decomposition — no perf-relevant change. The round-3-confirmed FlatLists (notification-bell, goal-list, calendar day entries), RNGH swipe (`use-horizontal-swipe.ts` `Gesture.Pan()`), and transform/opacity-only motion (collapsible grid-rows, tour/onboarding dots) all remain intact (re-read). No `transition-all` in web source; mobile `useNativeDriver: false` only at `status-dot.tsx:89` (D8-sanctioned SVG).

API: no controller/handler files beyond the four above changed in `fcfdc95` (verified `git diff --name-only dec5bcc fcfdc95`).

---

## STILL-OPEN

Both are round-3 → round-4 carryovers (the fix wave did not schedule them; both are LOW and were already enumerated).

- **LOW · `apps/web/app/globals.css:527-532` (`@keyframes loading-slide`, consumed by `.loading-bar` `:527`; live in `app/(app)/calendar/page.tsx` + `app/(app)/page.tsx` skeleton bars) · DESIGN.md Motion (animate transform/opacity only) · the loading shimmer animates `background-position` (`0%`/`100%` keyframes `:531-532`) — neither transform nor opacity; repaints the gradient every frame while mounted · size the gradient onto a 200%-wide child/pseudo and animate `translateX`.** Unchanged from round-3. The one web D9 item the fix wave never picked up.
- **LOW · `apps/mobile/hooks/use-tour-scroll-container.ts:16-22` (`onTourScroll`), attached on four hot scroll surfaces (`app/(tabs)/index.tsx`, `calendar.tsx`, `profile.tsx`, `components/habit-list.tsx`) · #107 JS-thread work in scroll handlers · the always-attached JS `onTourScroll` streams `contentOffset.y` to `tourScrollRegistry` on every scroll frame for the rarely-active tour · attach only while a tour is active, or move to a Reanimated `useAnimatedScrollHandler` + shared value.** Unchanged from round-3.

Re-verified clean (fresh): the `await`-in-loop DB-scan pattern across `Orbit.Application` now surfaces ZERO sites (BulkDeleteUserFacts, AssignTagsTool, CreateHabitTool all batched). `GetHabitMetricsQuery.cs` keeps its unfiltered `Include(h => h.Logs)` BY DESIGN (lifetime metrics) — not a finding. No new sync-over-async / `.Result` / `.Wait()`. The four unbounded user-data lists remain FlatLists; achievements catalog (`achievements.tsx`, 25 items) is the sole documented `.map`-in-ScrollView, explicitly "acceptable now" in round-3 — unchanged, not re-counted as a new finding.

---

## Verdict

**2 findings — 0 HIGH · 0 MED · 2 LOW** (both round-3 carryovers).

By repo:
- **orbit-api: ZERO findings.** All 4 round-3 perf items (2 MED SkipHabit filtered includes + 2 LOW N+1 batches) CONFIRMED FIXED in `fcfdc95`, with the touching tests rewired to the batched implementations.
- **orbit-ui-mobile: 2 findings — 0 HIGH · 0 MED · 2 LOW** (web loading-bar `background-position` D9; mobile unconditional tour-scroll JS handler). Both pre-existed round-3; neither was in the round-4 fix scope.

No regressions. Deps unchanged: npm 12 moderate / 0 high (DEF-4/5), dotnet 0 vulnerable.
