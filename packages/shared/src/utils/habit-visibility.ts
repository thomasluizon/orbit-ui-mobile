import type { NormalizedHabit } from '../types/habit'
import { formatAPIDate } from './dates'
import { hasHabitScheduleOnDate } from './habits'

export type HabitVisibilityView = 'today' | 'all' | 'general'

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
  getVisibleChildren: (parentId: string, view: HabitVisibilityView) => NormalizedHabit[]
}

export function getChildrenFromIndex(
  parentId: string,
  habitsById: Map<string, NormalizedHabit>,
  childrenByParent: Map<string, string[]>,
): NormalizedHabit[] {
  const ids = childrenByParent.get(parentId) ?? []
  return ids
    .map((id) => habitsById.get(id))
    .filter((habit): habit is NormalizedHabit => habit !== undefined)
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

export function createHabitVisibilityHelpers({
  habitsById,
  childrenByParent,
  selectedDate,
  searchQuery,
  showCompleted,
  recentlyCompletedIds,
}: HabitVisibilityOptions): HabitVisibilityHelpers {
  const isDueOnSelectedDate = (habit: NormalizedHabit): boolean => {
    const dateStr = selectedDate || formatAPIDate(new Date())
    return hasHabitScheduleOnDate(habit, dateStr)
  }

  const isRelevantToday = (habit: NormalizedHabit): boolean => {
    if (habit.isGeneral) return true
    if (isDueOnSelectedDate(habit)) return true
    const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
    return children.some((child) => isRelevantToday(child))
  }

  const hasVisibleContent = (habit: NormalizedHabit): boolean => {
    if (recentlyCompletedIds.has(habit.id)) return true
    if (!habit.isCompleted && (habit.isGeneral || isDueOnSelectedDate(habit) || habit.isOverdue)) {
      return true
    }
    const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
    return children.some((child) => hasVisibleContent(child))
  }

  const hasSearchMatch = (habit: NormalizedHabit): boolean => {
    if (habit.searchMatches && habit.searchMatches.length > 0) return true
    const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
    return children.some((child) => hasSearchMatch(child))
  }

  const getVisibleChildren = (
    parentId: string,
    view: HabitVisibilityView,
  ): NormalizedHabit[] => {
    let children = getChildrenFromIndex(parentId, habitsById, childrenByParent)

    if (searchQuery.trim()) {
      children = children.filter((child) => hasSearchMatch(child))
    }

    if (showCompleted) return children

    if (view === 'general' || view === 'all') {
      return children.filter(
        (child) => !child.isCompleted || recentlyCompletedIds.has(child.id),
      )
    }

    return children.filter((child) => hasVisibleContent(child))
  }

  return {
    isDueOnSelectedDate,
    isRelevantToday,
    hasVisibleContent,
    hasSearchMatch,
    getVisibleChildren,
  }
}
