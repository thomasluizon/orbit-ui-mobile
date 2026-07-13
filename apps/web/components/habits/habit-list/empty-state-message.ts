import { getHabitEmptyStateKey } from '@orbit/shared/utils'

/** Resolves the localized empty-state body copy for a habit-list view. */
export function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}
