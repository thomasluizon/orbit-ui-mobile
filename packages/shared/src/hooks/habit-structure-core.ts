import type { QueryClient } from '@tanstack/query-core'
import type { ChecklistItem,HabitDetail,HabitFullDetail,HabitScheduleItem,UpdateHabitRequest } from '../types/habit'
import { habitKeys,type HabitListKey,type HabitListSnapshots } from '../query/keys'
import { updateCachedHabitDetails } from '../query/habit-cache'
import { updateCachedHabitLists } from '../query/habit-cache'
import { optimisticPatchHabit } from '../utils/habit-optimistic'
import { optimisticMoveHabitParent } from '../utils/habit-parent-optimistic'



export function snapshotHabitMutationLists(queryClient: QueryClient): HabitListSnapshots {
  return queryClient.getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
    .filter((entry): entry is [HabitListKey, HabitScheduleItem[] | undefined] => entry[0][0] === 'habits' && entry[0][1] === 'list')
}

export function applyHabitStructurePatch(queryClient: QueryClient, habitId: string, request: UpdateHabitRequest, patch: Partial<HabitScheduleItem>) {
  const parentId = request.clearParent === true ? null : request.parentId ?? undefined
  const parentChange = parentId === undefined ? undefined : { habitId, parentId }
  const previousDetails = updateCachedHabitDetails(queryClient, habit => habit.id === habitId
    ? { ...patch, ...(parentChange ? { parentId } : {}) } : {}, parentChange)
  updateCachedHabitLists(queryClient, items => {
    const patched = optimisticPatchHabit(items, habitId, patch)
    return parentChange ? optimisticMoveHabitParent(patched, habitId, parentChange.parentId, true) : patched
  })
  return previousDetails
}

export function applyHabitChecklistDetails(queryClient: QueryClient, habitId: string, items: ChecklistItem[]) {
  const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(habitId))
  const previousFullDetail = queryClient.getQueryData<HabitFullDetail>(habitKeys.fullDetail(habitId))
  queryClient.setQueryData<HabitDetail>(habitKeys.detail(habitId), old => old ? { ...old, checklistItems: items } : old)
  queryClient.setQueryData<HabitFullDetail>(habitKeys.fullDetail(habitId), old => old ? { ...old, habit: { ...old.habit, checklistItems: items } } : old)
  return { previousDetail, previousFullDetail }
}
