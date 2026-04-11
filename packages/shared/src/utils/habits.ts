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
function resolveAnchorParent(
  anchor: ReorderableHabitItem | undefined,
  movedId: string,
  habitsById: Map<string, ReorderableHabitItem>,
): string | null | undefined {
  if (!anchor || anchor.id === movedId) return undefined
  return habitsById.get(anchor.id)?.parentId ?? anchor.parentId
}

function resolveInsertIndex(
  siblings: ReorderableHabitItem[],
  afterAnchor: ReorderableHabitItem | undefined,
  beforeAnchor: ReorderableHabitItem | undefined,
  movedId: string,
  newIndex: number,
): number {
  if (afterAnchor && afterAnchor.id !== movedId) {
    const idx = siblings.findIndex((s) => s.id === afterAnchor.id)
    if (idx >= 0) return idx
  }
  if (beforeAnchor && beforeAnchor.id !== movedId) {
    const idx = siblings.findIndex((s) => s.id === beforeAnchor.id)
    if (idx >= 0) return idx + 1
  }
  if (newIndex === 0) return 0
  return siblings.length
}

function getAllSiblings(
  parentId: string | null,
  habitsById: Map<string, ReorderableHabitItem>,
  getChildren: (parentId: string) => ReorderableHabitItem[],
): ReorderableHabitItem[] {
  if (parentId === null) {
    return Array.from(habitsById.values()).filter(
      (habit) => (habit.parentId ?? null) === null,
    )
  }
  return getChildren(parentId)
}

function siblingsToPositions(siblings: ReorderableHabitItem[]): HabitReorderPosition[] {
  return siblings.map((sibling, index) => ({ habitId: sibling.id, position: index }))
}

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

  const visibleReordered = [...items]
  visibleReordered.splice(oldIndex, 1)
  visibleReordered.splice(newIndex, 0, movedVisible)

  const afterAnchor = visibleReordered[newIndex + 1]
  const beforeAnchor = newIndex > 0 ? visibleReordered[newIndex - 1] : undefined

  const destinationParentId =
    resolveAnchorParent(afterAnchor, movedId, habitsById) ??
    resolveAnchorParent(beforeAnchor, movedId, habitsById) ??
    originalParentId

  const destinationSiblings = sortSiblingsByPosition(
    getAllSiblings(destinationParentId, habitsById, getChildren)
      .filter((sibling) => sibling.id !== movedId),
  )

  const fullInsertIndex = resolveInsertIndex(
    destinationSiblings, afterAnchor, beforeAnchor, movedId, newIndex,
  )

  const mergedDestination: ReorderableHabitItem[] = [...destinationSiblings]
  mergedDestination.splice(fullInsertIndex, 0, { ...movedHabit, parentId: destinationParentId })

  const positions = siblingsToPositions(mergedDestination)

  if (destinationParentId !== originalParentId) {
    const oldSiblings = sortSiblingsByPosition(
      getAllSiblings(originalParentId, habitsById, getChildren)
        .filter((sibling) => sibling.id !== movedId),
    )
    positions.push(...siblingsToPositions(oldSiblings))
  }

  return positions
}
