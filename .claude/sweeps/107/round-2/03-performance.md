# Sweep #3 — Performance (static), issue #107 ROUND 2

Scope: working trees of `orbit-ui-mobile` (main, round-1 fixes committed `ae5c150`) + `orbit-api` (`chore/107-code-health-sweep`, round-1 fixes committed `eee06ae`). Static reading + grep only; every line below independently re-read at the cited `file:line`. Lighthouse / runtime measurement out of scope (DEF-1, user-owned) — no browsers, no chrome-devtools. Rules cited: issue #107 Strand-2 agent-3 bullets (Web / Mobile / API / Animations); DESIGN.md Motion (line 151) + Bans (line 159, "No `transition-all`. Animate `transform` and `opacity` only") + D8 (line 157, SVG `stroke-dashoffset` sanctioned); apps/mobile/CLAUDE.md (Android elevation + overflow bug); triage-round-1.md decisions D9/D22/D25.

Format: `SEVERITY · file:line · rule · fix`.

---

## Round-1 verification

### API (orbit-api) — all 6 domain fixes CONFIRMED FIXED

1. **BulkLog gamification batching** — FIXED. `src/Orbit.Application/Habits/Commands/BulkLogHabitsCommand.cs:90` now calls the batch method `services.GamificationService.ProcessHabitsLogged(userId, loggedHabitIds, ct)` ONCE after the loop (no per-item awaited gamification call); the include at `:54` is date-bounded (`Include(h => h.Logs.Where(l => l.Date >= loggableWindowStart))`).
2. **GamificationService bounded windows** — FIXED. `src/Orbit.Application/Gamification/Services/GamificationService.cs:43-73` exposes `ProcessHabitsLogged` loading user/earned/habits once per batch; includes are date-filtered (`:88` `Where(l => l.Date >= perfectStreakCutoff && l.Date <= today)`) and counts use `CountAsync` aggregates (`:95`) instead of full materialization.
3. **LogHabit filtered includes** — FIXED. `src/Orbit.Application/Habits/Commands/LogHabitCommand.cs:65` (`Include(h => h.Logs.Where(l => l.Date >= loggableWindowStart))`) and `:244` (`ThenInclude(h => h.Logs.Where(l => l.Date >= streakWindowStart))`) are now bounded.
4. **ReorderGoals N+1** — FIXED. `src/Orbit.Application/Goals/Commands/ReorderGoalsCommand.cs:28-30` fetches all goals in one `FindTrackedAsync` then updates in memory; the per-goal `FindOneTrackedAsync`-in-`foreach` is gone (mirrors `ReorderHabitsCommand`).
5. **Notifications index + AdoptPerformanceIndexes migration** — FIXED. `src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs:165` `HasIndex(n => new { n.UserId, n.CreatedAtUtc }).IsDescending(false, true)`; `(UserId, IsRead)` retained for the unread `CountAsync`. The orphan `20260410235000_AddPerformanceIndexes.cs` is gone and a proper scaffold `20260613001629_AdoptPerformanceIndexes.cs:13-17` creates the new index (descending CreatedAtUtc) alongside the idempotent perf-index ops; `OrbitDbContextModelSnapshot` (≈:858-859) reflects it.
6. **ConfigController Cache-Control** — FIXED. `src/Orbit.Api/Controllers/ConfigController.cs:20` `[ResponseCache(Duration = 300, Location = ResponseCacheLocation.Client)]` on the GET.

### Frontend (orbit-ui-mobile) — all 6 D9/D25/list fixes NOT applied (STILL-OPEN)

The Wave-2 frontend agents died at the session limit before applying their perf partition (recovery-notes.md: "Wave-2 partition completeness unknown"). The build is green only because none of these edits is a compile dependency. Every round-1 frontend perf finding re-surfaces below — they are the authoritative round-2 list for this domain, NOT new analysis.

- **D25 Today/Calendar PanResponder→RNGH** — STILL-OPEN (re-listed under Mobile).
- **notification-bell .map→FlatList** — STILL-OPEN (Mobile).
- **goal-list .map→FlatList** — STILL-OPEN (Mobile).
- **calendar .map→FlatList** — STILL-OPEN (Mobile).
- **D9 web collapsible / tour-dots / onboarding-dots / mobile onboarding-dot / loading-bar** — STILL-OPEN (Web + Mobile).

### Confirmed FIXED beyond the API set (do not re-report)
- Image `resizeMethod="resize"` is now present on BOTH round-1 sites: `apps/mobile/components/message-bubble.tsx:121` and `apps/mobile/components/chat/chat-input-area.tsx:145`. Round-1 LOW closed.
- D8: `apps/mobile/components/ui/status-dot.tsx` `strokeDashoffset` animation is sanctioned by DESIGN.md:157 — not a finding.

---

## STILL-OPEN — Web (apps/web)

- MED · `apps/web/app/globals.css:1014-1017` (`.collapsible`, consumed `apps/web/components/habits/habit-form-fields.tsx:1339`) · CSS transition of `grid-template-rows` 0fr→1fr — a layout property (DESIGN.md Bans; #107 "No CSS layout-property animations"); reflows the whole advanced-section subtree every frame for `--dur-base` · D9: replace with instant container + opacity/translateY content entrance (or transform reveal measured once).
- LOW · `apps/web/components/tour/tour-tooltip.tsx:328` · `transition-[width,background-color]` animates `width` on the tour progress dots (DESIGN.md Bans) · D9: fixed-width dots + `transform: scaleX()` (origin left), or opacity crossfade.
- LOW · `apps/web/components/onboarding/onboarding-flow.tsx:325` (width 7→24 at `:327`) · same `transition-[width,...]` on onboarding `ProgressDots` · D9: same `scaleX` fix; land with the mobile mirror.
- LOW · `apps/web/app/globals.css:515-531` (`.loading-bar` + `@keyframes loading-slide`) · infinite animation of `background-position` — neither transform nor opacity (DESIGN.md Motion line 151); repaints the gradient while mounted · D9: size the gradient onto a 200%-wide child/pseudo and animate `translateX`.

Checked clean (web): `transition-all` still zero everywhere. All other `transition-[…]` arbitrary values name compositor/paint-safe properties (transform/opacity/color/background-color/box-shadow). No raw `<img>` outside the `LocalImage` blob-URL seam; `next/image` used for static assets. No WAAPI/`el.animate()`, no animation libraries; the only continuous rAF (`components/tour/tour-provider.tsx`) stays event-gated + tour-scoped. The `@keyframes slide-date-left/right` (`globals.css` ≈:425/:430) animate `background-position` too, but are one-shot view-transition crossfades (not perpetual) — within the D9/loading-bar family, not a separate perpetual-repaint finding.

## STILL-OPEN — Mobile (apps/mobile)

- MED · `apps/mobile/hooks/use-horizontal-swipe.ts:21-48`, consumed `app/(tabs)/index.tsx:487/1046/1397` and `app/(tabs)/calendar.tsx` · `PanResponder.create` runs `onMoveShouldSetPanResponder` (`:22-40`) on the JS thread for every touch-move on the two hottest screens, including while the habit list scrolls (#107 "worklets stay on the UI thread"; D25) · migrate to RNGH `Gesture.Pan().activeOffsetX(±50).failOffsetY(...)` with an `onEnd` worklet (`runOnJS` only for navigation); RNGH is already a dependency (DraggableFlatList in habit-list). Note in PR body for user visual QA.
- MED · `apps/mobile/components/navigation/notification-bell.tsx:289` · notifications rendered via `visibleNotifications.map(...)` inside a `ScrollView` (`:276`); the server caps the payload at 50 (`orbit-api .../AppConstants.cs`), so opening the sheet eagerly mounts up to 50 pressable cards (#107 "FlatList vs map in long lists") · render the sheet body as a `FlatList` (actions row as `ListHeaderComponent`); FlatList is the in-repo pattern (habit-list, chat, app-select).
- MED · `apps/mobile/components/goals/goal-list.tsx:29-46` (hosted in the goals-tab `ScrollView` at `app/(tabs)/index.tsx:1426`) · unbounded user goals rendered via `.map()` wrapping each in an `Animated.View`, inside a ScrollView (#107 "FlatList vs map"; goals grow like habits, which use FlatList) · convert the goals tab body to a `FlatList` with the shared header as `ListHeaderComponent`.
- MED · `apps/mobile/app/(tabs)/calendar.tsx:454-480` · selected-day entries (`filteredEntries.map(...)`, unbounded per-day, each in an `Animated.View`) rendered inside the screen `ScrollView` (#107 "FlatList vs map") · move day entries into a `FlatList` (calendar grid as `ListHeaderComponent`) or virtualize the day panel.
- LOW · `apps/mobile/components/onboarding/onboarding-flow.tsx:57-62` (`ProgressDot`) · `Animated.timing` animates `width` 7↔24 with `useNativeDriver: false` (`:61`) — a JS-thread layout-property animation (DESIGN.md Motion; #107 mobile "keep animation off the JS thread") · D9: animate `transform: [{ scaleX }]` with `useNativeDriver: true` (mirror of the web `ProgressDots` fix; land both together for parity).
- LOW · `apps/mobile/hooks/use-tour-scroll-container.ts:16-23` with `scrollEventThrottle={16}`, attached on four hot scroll surfaces (`app/(tabs)/index.tsx`, `app/(tabs)/calendar.tsx`, `app/(tabs)/profile.tsx`, `components/habit-list.tsx`) · an always-attached JS `onScroll` streams bridge events at up to 60fps to track position for the rarely-active feature tour (#107: JS-thread work inside scroll handlers) · attach only while a tour is active, or track via Reanimated `useAnimatedScrollHandler` + shared value.
- LOW · `apps/mobile/app/achievements.tsx:169-178` + `apps/mobile/app/achievements-sections.tsx:39-50` · achievements catalog mapped inside a `ScrollView`; catalog is 25 today and grows per release, each tile mounting an `Animated.View` wrapper (#107 named category: achievements) · acceptable now; switch to a `numColumns` FlatList when it grows, or cap entrance-animation wrappers. (Carried from round-1 LOW; unchanged.)

Checked clean (mobile): the ONLY real `PanResponder` usage is `use-horizontal-swipe.ts` — the `bottom-sheet-modal.tsx` hit is a JSDoc line stating it deliberately does NOT use one (native TrueSheet handles drag), and the `index.tsx`/`calendar.tsx` hits only consume the hook via `panHandlers`. Both chat `Image` sites now carry `resizeMethod="resize"`. The only `useNativeDriver: false` sites remain the two known ones (status-dot `strokeDashoffset` — D8 sanctioned; onboarding ProgressDot — flagged above); all backdrop/overlay/celebration animations are native-driven. No `useAnimatedStyle` worklet reads React state per frame. No same-file `elevation` inside `overflow: 'hidden'` (apps/mobile/CLAUDE.md bug).

## STILL-OPEN — API (orbit-api)

### Fresh (not in round-1)

- HIGH · `src/Orbit.Application/Habits/Commands/BulkSkipHabitsCommand.cs:42` · UNFILTERED `q.Include(h => h.Logs)` on the bulk-skip hot path — loads every targeted habit's entire log history, only to compute flexible-skip remaining counts + schedule checks (`ProcessSkipItem` reads `habit.Logs` at `:109`). This is the exact pattern round-1 fixed on the sibling `BulkLogHabitsCommand.cs:54` and `LogHabitCommand.cs:65` — the date-bound fix landed on log/single-log but the parallel bulk-SKIP path was missed (#107 "EF Core N+1 / unfiltered Includes on hot endpoints"; in-repo convention is date-bounded filtered includes) · apply `Include(h => h.Logs.Where(l => l.Date >= loggableWindowStart))` (BulkLog already computes `loggableWindowStart = today.AddDays(-AppConstants.DefaultOverdueWindowDays)` at `:51`).
- MED · `src/Orbit.Application/Tags/Commands/CreateTagCommand.cs:20-24` · duplicate-name guard does `FindAsync(...)` then `.Count > 0` — materializes the matching tag entity (and the predicate `t.Name == request.Name.Trim()` differs from the create call `Tag.Create(..., request.Name, ...)` which does not pre-trim, a latent off-by-trim mismatch) just to test existence (#107 "missing projection — materializing entities to compute a count") · use `await tagRepository.AnyAsync(t => t.UserId == … && t.Name == name.Trim(), ct)` (or `CountAsync`). Bounded per-user set, hence MED not HIGH, but it is an unbounded-by-design list as a user accrues tags.
- MED · `src/Orbit.Application/UserFacts/Commands/CreateUserFactCommand.cs:20-24` · cap check does `FindAsync(...)` then `.Count >= maxFacts` — materializes all of a user's facts to read a count (#107 "missing projection") · `CountAsync(f => f.UserId == … && !f.IsDeleted, ct)`.
- MED · `src/Orbit.Application/ApiKeys/Commands/CreateApiKeyCommand.cs:39-43` · active-key cap does `FindAsync(...)` then `.Count >= MaxActiveKeys` — materializes the key entities (incl. hashes) only to count them (#107 "missing projection") · `CountAsync(k => k.UserId == … && !k.IsRevoked, ct)`. Bounded at 5, lowest blast radius of the three; still entity-materialization on a write path.

### Carried from round-1 LOW (still open — round-1 fix wave did not reach these)

- LOW · `src/Orbit.Application/UserFacts/Commands/BulkDeleteUserFactsCommand.cs:26-37` · per-`factId` `FindOneTrackedAsync` inside `foreach` — N+1 on a bulk endpoint; batched precedent at `BulkDeleteHabitsCommand.cs:32` · one `FindTrackedAsync` with `factIds.Contains(f.Id) && f.UserId == …`, soft-delete in memory.
- LOW · `src/Orbit.Application/Chat/Tools/Implementations/AssignTagsTool.cs:116-137` (`ResolveTagsByNameAsync`) + `src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs:298-320` (`AssignTagsToHabitAsync`) · per-tag-name `FindOneTrackedAsync` inside a loop — N+1 (N = tag names) on agent tool paths · batch-fetch existing tags by the capitalized name set in one query, create the misses.

Checked clean (API): no real sync-over-async — the round-1 false positives (`RunCalendarAutoSyncCommand.cs:75`, `GetCalendarEventsQuery.cs:89`) remain `Result<T>`/awaited-value property access, not blocking calls; no new `.Result`/`.Wait()`/`.GetAwaiter().GetResult()` blocking sites. The bulk habit log/skip/delete commands all batch their primary habit fetch (only the BulkSkip *include filter* is the gap above). Named hot reads stay set-based and DTO-projected; the new notifications `(UserId, CreatedAtUtc DESC)` index covers the bell's `WHERE UserId ORDER BY CreatedAtUtc DESC LIMIT 50`.

---

## Verdict

**17 findings — 1 HIGH · 6 MED · 10 LOW.**

By repo:
- **orbit-api: 6 findings — 1 HIGH · 3 MED · 2 LOW.** All FRESH or round-1-LOW carryovers; the 6 round-1 HIGH/MED domain fixes are all CONFIRMED FIXED.
- **orbit-ui-mobile: 11 findings — 0 HIGH · 3 MED · 8 LOW.** These are the round-1 frontend findings re-surfaced unchanged — the Wave-2 perf partition (D9 / D25 / .map→FlatList) was never applied (session-limit death; build stays green because none is a compile dependency). No NEW frontend regression found.

Confirmed FIXED (do not re-report): BulkLog batching, GamificationService bounded windows, LogHabit/BulkLog filtered includes, ReorderGoals N+1, notifications `(UserId, CreatedAtUtc)` index + `AdoptPerformanceIndexes` scaffold (orphan migration deleted, snapshot coherent), ConfigController `[ResponseCache]`, both chat image `resizeMethod="resize"` sites, D8 SVG `stroke-dashoffset` ratified.

No findings in: web `transition-all`, web raw-`<img>`/WAAPI/perpetual-rAF, mobile transparent-backdrop JS-thread animation, mobile `useAnimatedStyle` state-per-frame, mobile elevation+`overflow:'hidden'` (same-file), API sync-over-async, API raw-entity serialization.
