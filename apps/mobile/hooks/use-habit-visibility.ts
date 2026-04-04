import { useCallback } from 'react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HabitVisibilityOptions {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  selectedDate: string
  searchQuery: string
  showCompleted: boolean
  recentlyCompletedIds: Set<string>
}

export interface HabitVisibilityHelpers {
  isDueOnSelectedDate: (habit: NormalizedHabit) => boolean
  isRelevantToday: (habit: NormalizedHabit) => boolean
  hasVisibleContent: (habit: NormalizedHabit) => boolean
  hasSearchMatch: (habit: NormalizedHabit) => boolean
  getVisibleChildren: (parentId: string, view: 'today' | 'all' | 'general') => NormalizedHabit[]
}

// ---------------------------------------------------------------------------
// Helper: get sorted children from the index
// ---------------------------------------------------------------------------

function getChildrenFromIndex(
  parentId: string,
  habitsById: Map<string, NormalizedHabit>,
  childrenByParent: Map<string, string[]>,
): NormalizedHabit[] {
  const ids = childrenByParent.get(parentId) ?? []
  return ids
    .map((id) => habitsById.get(id))
    .filter((h): h is NormalizedHabit => h !== undefined)
    .sort((a, b) => {
      if (a.position !== null && b.position !== null) {
        const diff = a.position - b.position
        if (diff !== 0) return diff
      }
      if (a.position !== null && b.position === null) return -1
      if (a.position === null && b.position !== null) return 1
      return a.createdAtUtc.localeCompare(b.createdAtUtc)
    })
}

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
  const isDueOnSelectedDate = useCallback(
    (habit: NormalizedHabit): boolean => {
      const dateStr = selectedDate || formatAPIDate(new Date())
      return habit.instances?.some((i) => i.date === dateStr) ?? false
    },
    [selectedDate],
  )

  const isRelevantToday = useCallback(
    (habit: NormalizedHabit): boolean => {
      if (isDueOnSelectedDate(habit)) return true
      const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
      return children.some((c) => isRelevantToday(c))
    },
    [isDueOnSelectedDate, habitsById, childrenByParent],
  )

  const hasVisibleContent = useCallback(
    (habit: NormalizedHabit): boolean => {
      if (recentlyCompletedIds.has(habit.id)) return true
      if (!habit.isCompleted && (isDueOnSelectedDate(habit) || habit.isOverdue)) return true
      const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
      return children.some((c) => hasVisibleContent(c))
    },
    [isDueOnSelectedDate, recentlyCompletedIds, habitsById, childrenByParent],
  )

  const hasSearchMatch = useCallback(
    (habit: NormalizedHabit): boolean => {
      if (habit.searchMatches && habit.searchMatches.length > 0) return true
      const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
      return children.some((c) => hasSearchMatch(c))
    },
    [habitsById, childrenByParent],
  )

  const getVisibleChildren = useCallback(
    (parentId: string, view: 'today' | 'all' | 'general'): NormalizedHabit[] => {
      let children = getChildrenFromIndex(parentId, habitsById, childrenByParent)

      if (searchQuery?.trim()) {
        children = children.filter((c) => hasSearchMatch(c))
      }

      if (showCompleted) return children

      if (view === 'general' || view === 'all') {
        return children.filter((c) => !c.isCompleted || recentlyCompletedIds.has(c.id))
      }

      return children.filter((c) => hasVisibleContent(c))
    },
    [habitsById, childrenByParent, searchQuery, showCompleted, recentlyCompletedIds, hasSearchMatch, hasVisibleContent],
  )

  return {
    isDueOnSelectedDate,
    isRelevantToday,
    hasVisibleContent,
    hasSearchMatch,
    getVisibleChildren,
  }
}
