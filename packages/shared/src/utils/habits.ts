import { isAfter, isSameDay } from 'date-fns'
import { parseAPIDate } from './dates'
import type { CalendarDayEntry, HabitDayStatus } from '../types/calendar'
import type { CalendarMonthResponse } from '../types/habit'

export interface HabitScheduleMatchSource {
  dueDate?: string | null
  scheduledDates?: string[] | null
  instances?: Array<{ date: string }> | null
}

export type HabitEmptyStateView = 'today' | 'all' | 'general'

export function getHabitEmptyStateKey(view: HabitEmptyStateView): string {
  if (view === 'general') return 'habits.emptyGeneral'
  if (view === 'today') return 'habits.noDueToday'
  return 'habits.noHabitsYet'
}

export function determineHabitDayStatus(
  date: Date,
  wasLogged: boolean,
  now: Date = new Date(),
): HabitDayStatus {
  if (wasLogged) return 'completed'
  if (isSameDay(date, now) || isAfter(date, now)) return 'upcoming'
  return 'missed'
}

export function buildCalendarDayMap(
  calendarMonth: CalendarMonthResponse,
  now: Date = new Date(),
): Map<string, CalendarDayEntry[]> {
  const map = new Map<string, CalendarDayEntry[]>()

  const logsByHabit = new Map<string, Set<string>>()
  for (const [habitId, habitLogs] of Object.entries(calendarMonth.logs)) {
    const dateSet = new Set<string>()
    for (const log of habitLogs) {
      dateSet.add(log.date)
    }
    logsByHabit.set(habitId, dateSet)
  }

  for (const habit of calendarMonth.habits) {
    const instanceDates =
      Array.isArray(habit.instances) && habit.instances.length > 0
        ? habit.instances.map((instance) => instance.date)
        : null

    const dates =
      instanceDates ??
      habit.scheduledDates ??
      []

    for (const dateStr of dates) {
      const date = parseAPIDate(dateStr)
      const wasLogged = logsByHabit.get(habit.id)?.has(dateStr) ?? false
      const status = determineHabitDayStatus(date, wasLogged, now)

      const entries = map.get(dateStr) ?? []
      entries.push({
        habitId: habit.id,
        title: habit.title,
        status,
        isBadHabit: habit.isBadHabit,
        dueTime: habit.dueTime ?? null,
        isOneTime: !habit.frequencyUnit,
      })
      map.set(dateStr, entries)
    }
  }

  return map
}

export function hasHabitScheduleOnDate(
  habit: HabitScheduleMatchSource,
  date: string,
): boolean {
  if (Array.isArray(habit.scheduledDates) && habit.scheduledDates.includes(date)) {
    return true
  }

  if (Array.isArray(habit.instances) && habit.instances.some((instance) => instance.date === date)) {
    return true
  }

  return (
    (!habit.scheduledDates || habit.scheduledDates.length === 0) &&
    (!habit.instances || habit.instances.length === 0) &&
    habit.dueDate === date
  )
}

export function collectSelectableDescendantIds(
  parentId: string,
  getChildIds: (id: string) => string[],
  selectableIds?: ReadonlySet<string>,
): string[] {
  const descendantIds: string[] = []
  const stack: string[] = [parentId]

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId) continue

    for (const childId of getChildIds(currentId)) {
      if (selectableIds && !selectableIds.has(childId)) {
        continue
      }

      descendantIds.push(childId)
      stack.push(childId)
    }
  }

  return descendantIds
}

export function collectVisibleHabitTreeIds<T extends { id: string }>(
  habits: Iterable<T>,
  getVisibleChildren: (id: string) => T[],
): Set<string> {
  const ids = new Set<string>()

  const visit = (habit: T) => {
    ids.add(habit.id)
    for (const child of getVisibleChildren(habit.id)) {
      visit(child)
    }
  }

  for (const habit of habits) {
    visit(habit)
  }

  return ids
}

export interface HabitHierarchyNode {
  parentId: string | null
}

export function hasAncestorInSet(
  habitId: string,
  habitsById: Map<string, HabitHierarchyNode>,
  ancestorIds: ReadonlySet<string>,
): boolean {
  const visited = new Set<string>()
  let parentId = habitsById.get(habitId)?.parentId ?? null

  while (parentId) {
    if (ancestorIds.has(parentId)) {
      return true
    }

    if (visited.has(parentId)) {
      return false
    }

    visited.add(parentId)
    parentId = habitsById.get(parentId)?.parentId ?? null
  }

  return false
}

export interface ReorderableHabitItem {
  id: string
  parentId: string | null
  position?: number | null
}

export interface HabitReorderPosition {
  habitId: string
  position: number
}

/**
 * Sort siblings deterministically by their current stored position,
 * pushing null/undefined positions to the end and breaking ties by id.
 */
function sortSiblingsByPosition<T extends ReorderableHabitItem>(siblings: T[]): T[] {
  return [...siblings].sort((a, b) => {
    const aPos = a.position ?? Number.MAX_SAFE_INTEGER
    const bPos = b.position ?? Number.MAX_SAFE_INTEGER
    if (aPos !== bPos) return aPos - bPos
    return a.id.localeCompare(b.id)
  })
}

/**
 * Computes the new position list after a drag-and-drop reorder.
 *
 * Handles filtered views correctly: when the visible `items` array is a subset
 * of all siblings (e.g. the Today view hides habits not scheduled today), this
 * function merges the moved item into the FULL sibling list (preserving hidden
 * siblings' relative order) and emits contiguous 0..N-1 positions for every
 * affected parent group. This prevents hidden siblings from drifting to the
 * end on every reorder.
 *
 * Also supports parent changes: if the dragged item lands next to an anchor
 * with a different parentId, both the old and new parent groups are re-emitted.
 */
export function computeHabitReorderPositions<T extends ReorderableHabitItem>(
  items: T[],
  oldIndex: number,
  newIndex: number,
  habitsById: Map<string, ReorderableHabitItem>,
  getChildren: (parentId: string) => ReorderableHabitItem[],
): HabitReorderPosition[] {
  if (
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= items.length ||
    newIndex >= items.length ||
    oldIndex === newIndex
  ) {
    return []
  }

  const movedVisible = items[oldIndex]
  if (!movedVisible) return []

  const movedId = movedVisible.id
  const movedHabit = habitsById.get(movedId) ?? movedVisible
  const originalParentId = movedHabit.parentId

  // Determine the destination parent by looking at the anchor (the filtered
  // item the dragged habit will be placed next to). This keeps parent-change
  // semantics working in draggable-flatlist style reorders where the caller
  // only passes visible items.
  const visibleReordered = [...items]
  visibleReordered.splice(oldIndex, 1)
  visibleReordered.splice(newIndex, 0, movedVisible)

  // Find the nearest visible sibling AFTER the new index to use as anchor,
  // else fall back to the one BEFORE. If none exists, keep original parent.
  let destinationParentId: string | null = originalParentId
  const afterAnchor = visibleReordered[newIndex + 1]
  const beforeAnchor = newIndex > 0 ? visibleReordered[newIndex - 1] : undefined
  if (afterAnchor && afterAnchor.id !== movedId) {
    destinationParentId = habitsById.get(afterAnchor.id)?.parentId ?? afterAnchor.parentId
  } else if (beforeAnchor && beforeAnchor.id !== movedId) {
    destinationParentId = habitsById.get(beforeAnchor.id)?.parentId ?? beforeAnchor.parentId
  }

  const getAllSiblings = (parentId: string | null): ReorderableHabitItem[] => {
    if (parentId === null) {
      return Array.from(habitsById.values()).filter(
        (habit) => (habit.parentId ?? null) === null,
      )
    }
    return getChildren(parentId)
  }

  // Build the destination parent's full sibling list (sorted by current
  // position) minus the moved habit, then splice the moved habit back in
  // at the correct full-list index translated from the filtered view.
  const destinationSiblings = sortSiblingsByPosition(
    getAllSiblings(destinationParentId).filter((sibling) => sibling.id !== movedId),
  )

  // Translate filtered index -> full-list index using anchors.
  let fullInsertIndex = destinationSiblings.length
  if (afterAnchor && afterAnchor.id !== movedId) {
    const idx = destinationSiblings.findIndex((s) => s.id === afterAnchor.id)
    if (idx >= 0) fullInsertIndex = idx
  } else if (beforeAnchor && beforeAnchor.id !== movedId) {
    const idx = destinationSiblings.findIndex((s) => s.id === beforeAnchor.id)
    if (idx >= 0) fullInsertIndex = idx + 1
  } else if (newIndex === 0) {
    fullInsertIndex = 0
  }

  const mergedDestination: ReorderableHabitItem[] = [...destinationSiblings]
  mergedDestination.splice(fullInsertIndex, 0, { ...movedHabit, parentId: destinationParentId })

  const positions: HabitReorderPosition[] = []
  mergedDestination.forEach((sibling, index) => {
    positions.push({ habitId: sibling.id, position: index })
  })

  // If parent changed, also re-emit contiguous positions for the OLD parent
  // group (the dragged habit is no longer in it).
  if (destinationParentId !== originalParentId) {
    const oldSiblings = sortSiblingsByPosition(
      getAllSiblings(originalParentId).filter((sibling) => sibling.id !== movedId),
    )
    oldSiblings.forEach((sibling, index) => {
      positions.push({ habitId: sibling.id, position: index })
    })
  }

  return positions
}
