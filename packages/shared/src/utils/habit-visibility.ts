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

/** A completed non-recurring (one-time) habit: it is done and has no future
 *  occurrence, so it drops out of the All view and out of destination pickers. */
export function isCompletedOneTimeHabit(
  habit: Pick<NormalizedHabit, 'isCompleted' | 'frequencyUnit'>,
): boolean {
  return habit.isCompleted && habit.frequencyUnit === null
}

export function isHabitVisibleInAllView(
  habit: Pick<NormalizedHabit, 'frequencyUnit' | 'isCompleted' | 'isGeneral'>,
  showCompleted: boolean,
): boolean {
  if (habit.isGeneral) return false
  if (showCompleted) return true
  return !isCompletedOneTimeHabit(habit)
}

/** Whether a habit may be offered as a move/link destination. A completed
 *  one-time habit is hidden unless a descendant is still active, so a finished
 *  project that still holds open children stays selectable and disappears only
 *  once its whole subtree is done. */
export function isHabitSelectableAsMoveTarget(
  habit: NormalizedHabit,
  getChildren: (habitId: string) => NormalizedHabit[],
): boolean {
  if (!isCompletedOneTimeHabit(habit)) return true
  return getChildren(habit.id).some((child) =>
    isHabitSelectableAsMoveTarget(child, getChildren),
  )
}

function normalizeMoveTargetSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Filters a flat, pre-order move-target list by a title query: keeps the root
 *  row plus any row that matches or has a matching descendant, so a match keeps
 *  its ancestor chain visible for context and a matching parent collapses to
 *  itself. Diacritic- and case-insensitive. */
export function filterMoveTargetsBySearch<
  T extends { id: string | null; label: string; depth: number },
>(rows: T[], query: string): T[] {
  const normalizedQuery = normalizeMoveTargetSearch(query)
  if (!normalizedQuery) return rows

  const matches = rows.map(
    (row) =>
      row.id !== null &&
      normalizeMoveTargetSearch(row.label).includes(normalizedQuery),
  )

  return rows.filter((row, index) => {
    if (row.id === null) return true
    if (matches[index]) return true
    for (let next = index + 1; next < rows.length; next++) {
      if (rows[next]!.depth <= row.depth) break
      if (matches[next]) return true
    }
    return false
  })
}

function isChildVisibleInAllView(
  habit: Pick<NormalizedHabit, 'frequencyUnit' | 'isCompleted' | 'isGeneral'>,
  showCompleted: boolean,
): boolean {
  if (habit.isGeneral) return false
  if (showCompleted) return true
  return !habit.isCompleted || habit.frequencyUnit !== null
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
  const selectedDateStr = selectedDate || formatAPIDate(new Date())

  const isLoggedOnSelectedDate = (habit: NormalizedHabit): boolean => {
    if (habit.isLoggedInRange) return true
    return habit.instances.some(
      (instance) => instance.date === selectedDateStr && instance.status === 'Completed',
    )
  }

  const isDueOnSelectedDate = (habit: NormalizedHabit): boolean => {
    return hasHabitScheduleOnDate(habit, selectedDateStr)
  }

  const isRelevantToday = (habit: NormalizedHabit): boolean => {
    if (habit.isGeneral) return true
    if (isDueOnSelectedDate(habit)) return true
    const children = getChildrenFromIndex(habit.id, habitsById, childrenByParent)
    return children.some((child) => isRelevantToday(child))
  }

  const hasVisibleContent = (habit: NormalizedHabit): boolean => {
    if (recentlyCompletedIds.has(habit.id)) return true
    const loggedOnSelectedDate = isLoggedOnSelectedDate(habit)
    if (showCompleted && (habit.isCompleted || loggedOnSelectedDate)) return true
    const hasOpenOwnContent = habit.isGeneral || isDueOnSelectedDate(habit) || habit.isOverdue
    if (!habit.isCompleted && !loggedOnSelectedDate && hasOpenOwnContent) {
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

    if (view === 'all') {
      return children.filter((child) => isChildVisibleInAllView(child, showCompleted))
    }

    if (showCompleted) return children

    if (view === 'general') {
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
