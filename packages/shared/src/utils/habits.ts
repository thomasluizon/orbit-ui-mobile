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
