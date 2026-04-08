import { useMemo } from 'react'
import {
  createHabitVisibilityHelpers,
  type HabitVisibilityHelpers,
  type HabitVisibilityOptions,
} from '@orbit/shared/utils/habit-visibility'
export type {
  HabitVisibilityHelpers,
  HabitVisibilityOptions,
} from '@orbit/shared/utils/habit-visibility'

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHabitVisibility({
  habitsById,
  childrenByParent,
  selectedDate,
  searchQuery,
  showCompleted,
  recentlyCompletedIds,
}: HabitVisibilityOptions): HabitVisibilityHelpers {
  return useMemo(
    () =>
      createHabitVisibilityHelpers({
        habitsById,
        childrenByParent,
        selectedDate,
        searchQuery,
        showCompleted,
        recentlyCompletedIds,
      }),
    [
      habitsById,
      childrenByParent,
      selectedDate,
      searchQuery,
      showCompleted,
      recentlyCompletedIds,
    ],
  )
}
