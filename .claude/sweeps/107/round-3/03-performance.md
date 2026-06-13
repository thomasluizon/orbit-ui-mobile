# Sweep #3 — Performance (static), issue #107 ROUND 3 (verification)

Baseline: ui-mobile `6399d00`, orbit-api `dec5bcc` (both green). Static reading + grep only; every cited line independently re-read. No browsers/Lighthouse (DEF-1). `npm audit` (12 moderate, 0 HIGH — DEF-4/5) and `dotnet list package --vulnerable` (0 vulnerable) run for the deps cross-check, both unchanged from round-2. Findings are NEW or still-open NON-deferred only.

Format: `SEVERITY · file:line · rule · fix`.

---

## Round-2 fixes — verification

### API (orbit-api) — round-2 set CONFIRMED FIXED
- **BulkSkip filtered include** (round-2 HIGH) — FIXED. `BulkSkipHabitsCommand.cs:43` now `Include(h => h.Logs.Where(l => l.Date >= loggableWindowStart))` (`loggableWindowStart` computed `:40`). The exact date-bound fix the round-2 HIGH asked for.
- **Materialize-for-count → Any/CountAsync** (round-2 3×MED) — all FIXED. `CreateTagCommand.cs:21` `AnyAsync` (and now uses `trimmedName` for both the guard and `Tag.Create`, closing the round-2 latent off-by-trim note); `CreateUserFactCommand.cs:20` `CountAsync`; `CreateApiKeyCommand.cs:39` `CountAsync`.

### Frontend (orbit-ui-mobile) — round-2 perf partition CONFIRMED FIXED
The Wave-2 frontend partition that died in round-2 was applied in round-3:
- **notification-bell .map→FlatList** — FIXED. `notification-bell.tsx:333` renders a `FlatList`.
- **goal-list .map→FlatList** — FIXED. `goal-list.tsx:73` `FlatList` with `ListHeaderComponent`/`ListEmptyComponent` props.
- **calendar day entries .map→FlatList** — FIXED. `calendar.tsx:550` `FlatList`; `calendarScrollRef` typed `FlatList<CalendarDayEntry>` (`:134`).
- **D25 swipe PanResponder→RNGH** — FIXED. `use-horizontal-swipe.ts:30` returns `Gesture.Pan()` (RNGH, UI-thread) for a `GestureDetector`; JSDoc states thresholds match the prior PanResponder. No `PanResponder` remains in the hook.
- **Mobile onboarding ProgressDot** (round-2 LOW) — FIXED. `onboarding-flow.tsx:63` `useNativeDriver: true` + `:77` `transform: [{ scaleX: scale }]` over fixed `width: 24` (`:72`). No JS-thread width animation.
- **Web collapsible grid-rows** (round-2 MED) — FIXED. `globals.css:1014-1016` sets `grid-template-rows: 0fr`/`1fr` (`.is-open`, `:1019`) with NO `transition` on the container (only `transition: none !important` in the reduced-motion block, `:922`); content entrance is transform/opacity via `@keyframes collapsible-content-in` (`:1027-1036`). Exactly the round-2-recommended "instant container + opacity/translateY content" fix.
- **Web tour progress dots** (round-2 LOW) — FIXED. `tour-tooltip.tsx:319/321` use `transform: 'scaleX(1)'` / `scaleX(0.5)` instead of `transition-[width,...]`.
- **Web onboarding ProgressDots** (round-2 LOW) — FIXED. `onboarding-flow.tsx:325` `transition-[transform,background-color]` over fixed `width: 24` (`:327`) with `transform: scaleX(...)` (`:331`). Animates transform, not width.

Confirmed clean: web `transition-all` zero in source (only `.next` build-cache binaries match). Mobile `useNativeDriver: false` now only `status-dot.tsx:89` (D8-sanctioned SVG `strokeDashoffset`).

---

## STILL-OPEN — orbit-api

### Fresh (not enumerated in round-2)

- **MED · `src/Orbit.Application/Habits/Commands/SkipHabitCommand.cs:31` · #107 "EF Core unfiltered Includes on hot endpoints" (in-repo convention: date-bounded filtered includes) · apply `Include(h => h.Logs.Where(l => l.Date >= loggableWindowStart))`.** The single-skip hot path loads the habit with UNFILTERED `Include(h => h.Logs).Include(h => h.Goals)`, then uses `habit.Logs` only for `HabitScheduleService.GetRemainingCompletions(habit, targetDate, habit.Logs)` (`:96`) — a window-bounded computation. This is the exact pattern round-1 fixed on the single-LOG sibling `LogHabitCommand.cs:65` (`Where(l => l.Date >= loggableWindowStart)`) and round-2 fixed on the bulk-skip sibling `BulkSkipHabitsCommand.cs:43`. Single-skip is the one mirror command both filtered-include waves skipped. Compute `loggableWindowStart = today.AddDays(-AppConstants.DefaultOverdueWindowDays)` (as BulkSkip/LogHabit do) and bound the include.
- **MED · `src/Orbit.Application/Habits/Commands/SkipHabitCommand.cs:121` · same rule · apply `.ThenInclude(h => h.Logs.Where(l => l.Date >= streakWindowStart))`.** `SyncStreakGoals` loads linked streak goals with UNFILTERED `Include(g => g.Habits).ThenInclude(h => h.Logs)` — every log of every habit on every linked goal — then only runs `GoalStreakSyncService.SyncCurrentStreak(streakGoal, today)` (`:131`), a bounded-window streak recompute. Direct parallel of `LogHabitCommand.cs:244`, which round-1 bounded with `streakWindowStart = today.AddDays(-AppConstants.MaxStreakLookbackDays)`. Apply the same filter.

### Carried from round-2 LOW (fix wave still has not reached these)

- **LOW · `src/Orbit.Application/UserFacts/Commands/BulkDeleteUserFactsCommand.cs:26-37` · per-`factId` `FindOneTrackedAsync` inside `foreach` — N+1 on a bulk endpoint; batched precedent at `BulkDeleteHabitsCommand.cs` · one `FindTrackedAsync` with `factIds.Contains(f.Id) && f.UserId == …`, soft-delete in memory.** Unchanged from round-2.
- **LOW · `src/Orbit.Application/Chat/Tools/Implementations/AssignTagsTool.cs:116-137` (`ResolveTagsByNameAsync`) + `src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs:295-320` (`AssignTagsToHabitAsync`) · per-tag-name `FindOneTrackedAsync` inside a loop — N+1 (N = tag names) on agent tool paths · batch-fetch existing tags by the capitalized name set in one query, create the misses.** Unchanged from round-2; agent tool paths, hence LOW.

Checked clean (API, fresh): the `await`-in-loop DB scan across `Orbit.Application` surfaces only the three sites above (BulkDeleteUserFacts:28, AssignTagsTool:121, CreateHabitTool:303) — the two Gamification `foreach` loops iterate in-memory `newAchievements`, not DB. `GetHabitMetricsQuery.cs:22` keeps an unfiltered `Include(h => h.Logs)` BY DESIGN (lifetime metrics need full history) — not a finding. No new sync-over-async / `.Result` / `.Wait()` blocking sites. The notifications `(UserId, CreatedAtUtc DESC)` index from round-1 stands.

## STILL-OPEN — Web (apps/web)

- **LOW · `apps/web/app/globals.css:528-530` (`@keyframes loading-slide`, consumed by `loading-bar` `:525`; live in `app/(app)/calendar/page.tsx:158` + `app/(app)/page.tsx:534`) · infinite animation of `background-position` — neither transform nor opacity (DESIGN.md Motion line 151); repaints the gradient while mounted · D9: size the gradient onto a 200%-wide child/pseudo and animate `translateX`.** Unchanged from round-2; the one web D9 item not picked up in round-3 (the collapsible/tour-dots/onboarding-dots siblings were all fixed).

## STILL-OPEN — Mobile (apps/mobile)

- **LOW · `apps/mobile/hooks/use-tour-scroll-container.ts:16-21`, attached on four hot scroll surfaces (`app/(tabs)/index.tsx`, `app/(tabs)/calendar.tsx`, `app/(tabs)/profile.tsx`, `components/habit-list.tsx`) · an always-attached JS `onTourScroll` streams `contentOffset.y` to `tourScrollRegistry` on every scroll frame for the rarely-active feature tour (#107: JS-thread work in scroll handlers) · attach only while a tour is active, or track via Reanimated `useAnimatedScrollHandler` + shared value.** Unchanged from round-2; still the unconditional handler.
- **LOW · `apps/mobile/app/achievements.tsx:169` + `apps/mobile/app/achievements-sections.tsx:39` · achievements catalog (25 today, grows per release) mapped inside a `ScrollView`, each tile in an `Animated.View` · acceptable now; switch to a `numColumns` FlatList when it grows.** Unchanged from round-2 (explicitly "acceptable now").

Checked clean (mobile, fresh): the four unbounded user-data lists (habits, goals, notifications, calendar day entries) are all FlatLists now; achievements is the sole documented `.map`-in-ScrollView LOW. No NEW unbounded `.map` over user data found in the ScrollView surfaces scanned (the rest are static settings/legal pages or bounded modal forms). Only `PanResponder` reference left is the JSDoc in `bottom-sheet-modal.tsx` stating it deliberately does NOT use one.

---

## Verdict

**6 findings — 0 HIGH · 2 MED · 4 LOW.**

By repo:
- **orbit-api: 4 findings — 0 HIGH · 2 MED · 2 LOW.** The 2 MED are FRESH (SkipHabitCommand single-skip is the filtered-include sibling both prior waves missed — direct parallel to the already-fixed LogHabit single-log and BulkSkip bulk-skip); the 2 LOW are round-2 carryovers. All round-2 API perf items (BulkSkip HIGH, 3× materialize-for-count MED) CONFIRMED FIXED.
- **orbit-ui-mobile: 2 findings — 0 HIGH · 0 MED · 2 LOW.** Both are round-2 carryovers (web loading-bar D9; mobile tour-scroll JS handler). The entire round-2 frontend perf partition (3 MED FlatLists + RNGH swipe + 5 D9 LOWs) is CONFIRMED FIXED in round-3.

No regressions introduced. Deps unchanged: npm 12 moderate / 0 HIGH (DEF-4/5), dotnet 0 vulnerable.
