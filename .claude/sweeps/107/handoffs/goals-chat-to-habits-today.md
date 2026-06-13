# GOALS-CHAT-FIX → HABITS-TODAY-FIX

The mobile goal-list perf fix (R2 perf: `.map` in ScrollView → FlatList) required a minimal change to **your** file `apps/mobile/app/(tabs)/index.tsx`, because `GoalsView` was hosted inside that screen's `ScrollView`. A FlatList nested in a same-orientation ScrollView disables virtualization (RN warns), so the goals branch had to de-nest and let the list own scrolling — exactly how the habits branch already lets `HabitList` (a FlatList) own scrolling.

## What changed in `(tabs)/index.tsx` (already applied, tests green)

1. **Import:** added `type FlatList` to the `react-native` import and `import type { Goal } from "@orbit/shared/types/goal"`.
2. **goalsScrollRef:** `useRef<ScrollView>` → `useRef<FlatList<Goal>>`; `goalsScrollTo` now calls `scrollToOffset({ offset: y })` instead of `scrollTo({ y })`. (The tour scroll registry already supports FlatList — its JSDoc says so.)
3. **Goals branch render:** the `<ScrollView ref={goalsScrollRef} …>{sharedHeader}<GoalsView /></ScrollView>` block was replaced with:
   ```tsx
   <GoalsView
     listHeader={sharedHeader}
     scrollRef={goalsScrollRef}
     contentContainerStyle={isSelectMode ? styles.scrollContentWithBulkBar : undefined}
     onScroll={onGoalsTourScroll}
     onScrollBeginDrag={handleListScrollBeginDrag}
   />
   ```
4. **Orphaned styles removed:** `styles.scrollView` and `styles.scrollContent` (only used by the removed goals ScrollView). `scrollContentWithBulkBar` kept (still threaded as the bulk-bar bottom-padding override).

## New seam (my files)

- `apps/mobile/components/goals/goal-list.tsx` is now a `forwardRef<FlatList<Goal>>` that owns scrolling and accepts `ListHeaderComponent`, `ListEmptyComponent`, `contentContainerStyle`, `onScroll`, `onScrollBeginDrag`.
- `apps/mobile/components/goals/goals-view.tsx` now accepts `{ listHeader, scrollRef, contentContainerStyle, onScroll, onScrollBeginDrag }`, composes its SectionLabel/filter chrome + `listHeader` into the FlatList header, and renders skeleton/empty via `ListEmptyComponent`.

If you re-touch the goals branch, keep the FlatList-owns-scroll shape (don't re-wrap `GoalsView` in a ScrollView). `today-screen.test.tsx` (20 tests) passes with this structure.
