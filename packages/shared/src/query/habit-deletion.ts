import type { QueryClient } from '@tanstack/query-core'
import type { CalendarMonthResponse, HabitDetail, HabitFullDetail, HabitScheduleItem, PaginatedResponse } from '../types/habit'
import { optimisticRemoveHabits } from '../utils/habit-optimistic'
import { removeHabitDetailChild } from '../utils/habit-detail-flow'
import { habitKeys } from './keys'
import { updateCachedHabitLists } from './habit-cache'

type HabitBranch = { id: string; children: readonly HabitBranch[] }

export function isCachedHabitDeleted(queryClient: QueryClient, habitId: string): boolean {
  return queryClient.getQueryData(habitKeys.deleted(habitId)) !== undefined
}

export function cachedHabitDeletionIds(queryClient: QueryClient, habitIds: readonly string[], previousTrees: readonly HabitBranch[] = []): string[] {
  const deleted = new Set(habitIds.flatMap((id) => queryClient.getQueryData<string[]>(habitKeys.deleted(id)) ?? [id]))
  const trees: HabitBranch[] = [...previousTrees]
  for (const [, items] of queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })) trees.push(...items ?? [])
  for (const [, page] of queryClient.getQueriesData<PaginatedResponse<HabitScheduleItem>>({ queryKey: habitKeys.searches() })) trees.push(...page?.items ?? [])
  for (const [, month] of queryClient.getQueriesData<CalendarMonthResponse>({ queryKey: habitKeys.calendarPrefix() })) trees.push(...month?.habits ?? [])
  for (const [, detail] of queryClient.getQueriesData<HabitDetail>({ queryKey: habitKeys.details() })) if (detail) trees.push(detail)
  for (const [, detail] of queryClient.getQueriesData<HabitFullDetail>({ queryKey: habitKeys.fullDetails() })) if (detail) trees.push(detail.habit)
  function visit(node: HabitBranch, ancestorDeleted: boolean): void {
    const removed = ancestorDeleted || deleted.has(node.id)
    if (removed) deleted.add(node.id)
    for (const child of node.children) visit(child, removed)
  }
  for (const tree of trees) visit(tree, false)
  return [...deleted]
}

export async function removeDeletedHabitQueries(queryClient: QueryClient, habitId: string, deletedIds = cachedHabitDeletionIds(queryClient, [habitId])): Promise<void> {
  queryClient.setQueryDefaults(habitKeys.deletedPrefix(), { gcTime: Infinity })
  for (const id of deletedIds) queryClient.setQueryData(habitKeys.deleted(id), deletedIds)
  await queryClient.cancelQueries({ queryKey: habitKeys.all })
  const deleted = new Set(deletedIds)
  for (const id of deletedIds) {
    for (const queryKey of [habitKeys.detail(id), habitKeys.fullDetail(id), habitKeys.logs(id), habitKeys.metrics(id), habitKeys.rescheduleSuggestion(id)]) {
      queryClient.removeQueries({ queryKey })
    }
  }
  updateCachedHabitLists(queryClient, (items) => optimisticRemoveHabits(items, deleted))
  queryClient.setQueriesData<PaginatedResponse<HabitScheduleItem>>({ queryKey: habitKeys.searches() }, (page) => {
    if (!page) return page
    const items = optimisticRemoveHabits(page.items, deleted)
    return { ...page, items, totalCount: Math.max(0, page.totalCount - (page.items.length - items.length)) }
  })
  queryClient.setQueriesData<CalendarMonthResponse>({ queryKey: habitKeys.calendarPrefix() }, (month) => month ? {
    ...month, habits: optimisticRemoveHabits(month.habits, deleted),
    logs: Object.fromEntries(Object.entries(month.logs).filter(([id]) => !deleted.has(id))),
  } : month)
  const removeChildren = (detail: HabitDetail) => deletedIds.reduce(removeHabitDetailChild, detail)
  queryClient.setQueriesData<HabitDetail>({ queryKey: habitKeys.details() }, (detail) => detail ? removeChildren(detail) : detail)
  queryClient.setQueriesData<HabitFullDetail>({ queryKey: habitKeys.fullDetails() }, (detail) => detail ? { ...detail, habit: removeChildren(detail.habit) } : detail)
}

export function restoreDeletedHabitQueries(queryClient: QueryClient, habitId: string): void {
  const deletedIds = queryClient.getQueryData<string[]>(habitKeys.deleted(habitId)) ?? [habitId]
  for (const id of deletedIds) queryClient.removeQueries({ queryKey: habitKeys.deleted(id), exact: true })
}
