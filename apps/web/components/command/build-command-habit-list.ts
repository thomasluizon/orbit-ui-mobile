import {
  createHabitVisibilityHelpers,
  formatAPIDate,
  isHabitVisibleInAllView,
} from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

export interface CommandHabitEntry {
  habit: NormalizedHabit
  parentTitle: string | null
}

interface CommandHabitListInput {
  habitsById: Map<string, NormalizedHabit>
  childrenByParent: Map<string, string[]>
  topLevelHabits: readonly NormalizedHabit[]
}

const NO_RECENTLY_COMPLETED = new Set<string>()

/**
 * The single ordered habit list the command palette renders in its search/jump
 * group and its log/skip picker pages: the habits visible in the Today view
 * first (canonical position order, each parent immediately followed by its
 * visible sub-habits), then the remaining habits visible in the All view with
 * completed one-time tasks excluded. Every habit appears once; a sub-habit
 * carries its parent's title so it stays distinguishable in the flat list.
 */
export function buildCommandHabitList({
  habitsById,
  childrenByParent,
  topLevelHabits,
}: CommandHabitListInput): CommandHabitEntry[] {
  const visibility = createHabitVisibilityHelpers({
    habitsById,
    childrenByParent,
    selectedDate: formatAPIDate(new Date()),
    searchQuery: '',
    showCompleted: false,
    recentlyCompletedIds: NO_RECENTLY_COMPLETED,
  })

  const seen = new Set<string>()
  const entries: CommandHabitEntry[] = []

  function collectSubtree(parentId: string, parentTitle: string, view: 'today' | 'all') {
    for (const child of visibility.getVisibleChildren(parentId, view)) {
      if (!seen.has(child.id)) {
        seen.add(child.id)
        entries.push({ habit: child, parentTitle })
      }
      collectSubtree(child.id, child.title, view)
    }
  }

  for (const habit of topLevelHabits) {
    if (!visibility.hasVisibleContent(habit)) continue
    if (!seen.has(habit.id)) {
      seen.add(habit.id)
      entries.push({ habit, parentTitle: null })
    }
    collectSubtree(habit.id, habit.title, 'today')
  }

  for (const habit of topLevelHabits) {
    if (!isHabitVisibleInAllView(habit, false)) continue
    if (!seen.has(habit.id)) {
      seen.add(habit.id)
      entries.push({ habit, parentTitle: null })
    }
    collectSubtree(habit.id, habit.title, 'all')
  }

  return entries
}
