import { isAfter, isSameDay } from 'date-fns'
import { parseAPIDate } from './dates'
import type { CalendarDayEntry, HabitDayStatus } from '../types/calendar'
import type { CalendarMonthResponse } from '../types/habit'

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
}

export interface HabitReorderPosition {
  habitId: string
  position: number
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
    newIndex >= items.length
  ) {
    return []
  }

  const reordered = [...items]
  const removed = reordered.splice(oldIndex, 1)
  const moved = removed[0]
  if (!moved) return []
  reordered.splice(newIndex, 0, moved)

  const positions: HabitReorderPosition[] = []
  const positionByParent = new Map<string | null, number>()
  const includedIds = new Set(reordered.map((item) => item.id))

  for (const item of reordered) {
    const storeHabit = habitsById.get(item.id)
    const parentId = storeHabit?.parentId ?? item.parentId
    const nextPosition = positionByParent.get(parentId) ?? 0
    positions.push({ habitId: item.id, position: nextPosition })
    positionByParent.set(parentId, nextPosition + 1)
  }

  for (const parentId of positionByParent.keys()) {
    const allSiblings =
      parentId === null
        ? Array.from(habitsById.values()).filter((habit) => habit.parentId === null)
        : getChildren(parentId)

    for (const sibling of allSiblings) {
      if (includedIds.has(sibling.id)) continue

      const nextPosition = positionByParent.get(parentId) ?? 0
      positions.push({ habitId: sibling.id, position: nextPosition })
      positionByParent.set(parentId, nextPosition + 1)
    }
  }

  return positions
}
