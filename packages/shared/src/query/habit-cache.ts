import type { QueryClient } from '@tanstack/query-core'
import type { CreateHabitRequest, HabitScheduleItem, HabitsFilter } from '../types/habit'
import type { Goal } from '../types/goal'
import { formatAPIDate } from '../utils/dates'
import { goalKeys, habitKeys, tagKeys } from './keys'

interface CachedTag {
  id: string
  name: string
  color: string
}

export function buildCachedCreatedHabit(
  queryClient: QueryClient,
  id: string,
  request: CreateHabitRequest,
): HabitScheduleItem {
  const now = new Date()
  const dueDate = request.dueDate || formatAPIDate(now)
  const existing = queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    .flatMap(([, items]) => items ?? [])
  const position = Math.max(-1, ...existing.map((item) => item.position ?? -1)) + 1
  const tags = queryClient.getQueriesData<CachedTag[]>({ queryKey: tagKeys.lists() })
    .flatMap(([, items]) => items ?? [])
    .filter((tag) => request.tagIds?.includes(tag.id))
  const linkedGoals = queryClient.getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
    .flatMap(([, items]) => items ?? [])
    .filter((goal) => request.goalIds?.includes(goal.id))
    .map((goal) => ({ id: goal.id, title: goal.title }))

  return {
    id,
    title: request.title,
    description: request.description ?? null,
    emoji: request.emoji ?? null,
    frequencyUnit: request.frequencyUnit ?? null,
    frequencyQuantity: request.frequencyQuantity ?? null,
    isBadHabit: request.isBadHabit ?? false,
    isCompleted: false,
    isGeneral: request.isGeneral ?? false,
    isFlexible: request.isFlexible ?? false,
    days: request.days ?? [],
    dueDate,
    dueTime: request.dueTime ?? null,
    dueEndTime: request.dueEndTime ?? null,
    endDate: request.endDate ?? null,
    position,
    checklistItems: request.checklistItems ?? [],
    createdAtUtc: now.toISOString(),
    scheduledDates: request.isGeneral ? [] : [dueDate],
    isOverdue: false,
    reminderEnabled: request.reminderEnabled ?? false,
    reminderTimes: request.reminderTimes ?? [],
    scheduledReminders: request.scheduledReminders ?? [],
    slipAlertEnabled: request.slipAlertEnabled ?? false,
    tags,
    children: [],
    hasSubHabits: (request.subHabits?.length ?? 0) > 0,
    flexibleTarget: null,
    flexibleCompleted: null,
    linkedGoals,
    instances: request.isGeneral ? [] : [{ date: dueDate, status: 'Pending', logId: null }],
    searchMatches: null,
  }
}

function includesDate(filters: HabitsFilter, date: string): boolean {
  if (!filters.dateFrom) return true
  return filters.dateFrom <= date && (!filters.dateTo || date <= filters.dateTo)
}

export function updateHabitListsForDate(
  queryClient: QueryClient,
  date: string,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  for (const [key, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) {
    if (!items || !includesDate(key[2] as HabitsFilter, date)) continue
    queryClient.setQueryData(key, updater(items))
  }
}

export function invalidateHabitDependents(queryClient: QueryClient, habitId: string): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.logs(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.metrics(habitId) })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
}
