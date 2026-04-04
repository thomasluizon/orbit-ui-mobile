'use client'

import { useCallback } from 'react'
import { formatAPIDate } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HabitVisibilityOptions {
  /** Normalized habits map */
  habitsById: Map<string, NormalizedHabit>
  /** Parent-to-children index */
  childrenByParent: Map<string, string[]>
  /** Currently selected date (YYYY-MM-DD) */
  selectedDate: string
  /** Current search query */
  searchQuery: string
  /** Whether to show completed habits */
  showCompleted: boolean
  /** IDs of habits recently completed (for exit animation) */
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
  // Check if a habit is scheduled for the selected date
  const isDueOnSelectedDate = useCallback(
    (habit: NormalizedHabit): boolean => {
      const dateStr = selectedDate || formatAPIDate(new Date())
      return habit.instances?.some((i) => i.date === dateStr) ?? false
    },
    [selectedDate],
  )

  // Recursively check if a habit or any descendant is due today
  const isRelevantToday = useCallback(
    (habit: NormalizedHabit): boolean => {
      if (isDueOnSelectedDate(habit)) return true
      const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
      return children.some((c) => isRelevantToday(c))
    },
    [isDueOnSelectedDate, habitsById, childrenByParent],
  )

  // Recursively check if a habit or any of its descendants should be visible
  // when showCompleted is off
  const hasVisibleContent = useCallback(
    (habit: NormalizedHabit): boolean => {
      if (recentlyCompletedIds.has(habit.id)) return true
      if (!habit.isCompleted && (isDueOnSelectedDate(habit) || habit.isOverdue)) return true
      const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
      return children.some((c) => hasVisibleContent(c))
    },
    [isDueOnSelectedDate, recentlyCompletedIds, habitsById, childrenByParent],
  )

  // Recursively check if a habit or any descendant has search matches
  const hasSearchMatch = useCallback(
    (habit: NormalizedHabit): boolean => {
      if (habit.searchMatches && habit.searchMatches.length > 0) return true
      const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
      return children.some((c) => hasSearchMatch(c))
    },
    [habitsById, childrenByParent],
  )

  // Get children filtered by showCompleted setting and search query
  const getVisibleChildren = useCallback(
    (parentId: string, view: 'today' | 'all' | 'general'): NormalizedHabit[] => {
      let children = getChildrenFromIndex(parentId, habitsById, childrenByParent)

      // When searching, only show children that match or have matching descendants
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
