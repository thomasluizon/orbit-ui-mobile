'use client'

import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys, goalKeys, gamificationKeys, profileKeys } from '@orbit/shared/query'
import {
  applyLinkedGoalUpdates,
  buildOptimisticSkipPatch,
  findHabitInList,
  normalizeHabits,
} from '@orbit/shared/utils'
import {
  optimisticPatchHabit,
  optimisticToggleCompletion,
  optimisticUpdateChecklist,
} from '@/lib/habit-optimistic-helpers'
import type {
  HabitScheduleItem,
  HabitScheduleChild,
  HabitDetail,
  HabitFullDetail,
  CreateHabitRequest,
  UpdateHabitRequest,
  ReorderHabitsRequest,
  ChecklistItem,
  CreateSubHabitRequest,
  MoveHabitParentRequest,
  BulkCreateRequest,
  BulkLogItemRequest,
  BulkSkipItemRequest,
} from '@orbit/shared/types/habit'
import type { Goal } from '@orbit/shared/types/goal'
import type { Profile } from '@orbit/shared/types/profile'
import type { GamificationProfile } from '@orbit/shared/types/gamification'
import {
  createHabit as createHabitAction,
  updateHabit as updateHabitAction,
  deleteHabit as deleteHabitAction,
  logHabit as logHabitAction,
  skipHabit as skipHabitAction,
  reorderHabits as reorderHabitsAction,
  duplicateHabit as duplicateHabitAction,
  updateChecklist as updateChecklistAction,
  createSubHabit as createSubHabitAction,
  moveHabitParent as moveHabitParentAction,
  bulkCreateHabits as bulkCreateHabitsAction,
  bulkDeleteHabits as bulkDeleteHabitsAction,
  bulkLogHabits as bulkLogHabitsAction,
  bulkSkipHabits as bulkSkipHabitsAction,
} from '@/app/actions/habits'
import { useUIStore } from '@/stores/ui-store'
import { useAppToast } from '@/hooks/use-app-toast'

export {
  EMPTY_CHILDREN_BY_PARENT,
  EMPTY_HABITS_BY_ID,
  EMPTY_NORMALIZED_HABITS,
  normalizeHabits,
  sortByPosition,
  type NormalizedHabitsData,
  useHabitDetail,
  useHabitFullDetail,
  useHabitLogs,
  useHabitMetrics,
  useHabits,
  useTotalHabitCount,
} from './use-habit-queries'

type HabitListSnapshots = ReadonlyArray<
  readonly [readonly unknown[], HabitScheduleItem[] | undefined]
>

function snapshotHabitLists(queryClient: ReturnType<typeof useQueryClient>): HabitListSnapshots {
  return queryClient.getQueriesData<HabitScheduleItem[]>({
    queryKey: habitKeys.lists(),
  })
}

function restoreHabitLists(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshots: HabitListSnapshots,
): void {
  for (const [key, data] of snapshots) {
    if (data) {
      queryClient.setQueryData(key, data)
    }
  }
}

function updateHabitLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (items: HabitScheduleItem[]) => HabitScheduleItem[],
): void {
  queryClient.setQueriesData<HabitScheduleItem[]>(
    { queryKey: habitKeys.lists() },
    (old) => (old ? updater(old) : old),
  )
}

function applyPositionToChild(
  child: HabitScheduleChild,
  positionByHabitId: Map<string, number>,
): HabitScheduleChild {
  const nextPosition = positionByHabitId.get(child.id)
  const patched =
    nextPosition === undefined ? child : { ...child, position: nextPosition }
  if (patched.children.length === 0) return patched
  return {
    ...patched,
    children: patched.children.map((grandchild) =>
      applyPositionToChild(grandchild, positionByHabitId),
    ),
  }
}

function applyReorderPositions(
  items: HabitScheduleItem[],
  positions: ReorderHabitsRequest['positions'],
): HabitScheduleItem[] {
  const positionByHabitId = new Map(positions.map((p) => [p.habitId, p.position]))
  return items.map((item) => {
    const nextPosition = positionByHabitId.get(item.id)
    const patched =
      nextPosition === undefined ? item : { ...item, position: nextPosition }
    if (patched.children.length === 0) return patched
    return {
      ...patched,
      children: patched.children.map((child) =>
        applyPositionToChild(child, positionByHabitId),
      ),
    }
  })
}

function findCachedGoals(
  queryClient: ReturnType<typeof useQueryClient>,
  goalIds: string[] | undefined,
): Array<{ id: string; title: string }> {
  if (!goalIds?.length) return []

  const goals = queryClient
    .getQueriesData<Goal[]>({ queryKey: goalKeys.lists() })
    .flatMap(([, data]) => data ?? [])

  const goalMap = new Map(goals.map((goal) => [goal.id, goal]))

  return goalIds
    .map((goalId) => {
      const goal = goalMap.get(goalId)
      return goal ? { id: goal.id, title: goal.title } : null
    })
    .filter((goal): goal is { id: string; title: string } => goal !== null)
}

function buildOptimisticHabitPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  data: UpdateHabitRequest,
): Partial<HabitScheduleItem> {
  const patch: Partial<HabitScheduleItem> = {
    title: data.title,
    isBadHabit: data.isBadHabit,
  }

  if ('description' in data) patch.description = data.description ?? null
  if ('emoji' in data) patch.emoji = data.emoji ?? null
  if ('isGeneral' in data) patch.isGeneral = data.isGeneral ?? false
  if ('isFlexible' in data) patch.isFlexible = data.isFlexible ?? false
  if ('frequencyUnit' in data) patch.frequencyUnit = data.frequencyUnit ?? null
  if ('frequencyQuantity' in data) patch.frequencyQuantity = data.frequencyQuantity ?? null
  if ('days' in data) patch.days = data.days ?? []
  if ('dueDate' in data) patch.dueDate = data.dueDate ?? ''
  if ('dueTime' in data) patch.dueTime = data.dueTime ?? null
  if ('dueEndTime' in data) patch.dueEndTime = data.dueEndTime ?? null
  if ('reminderEnabled' in data) patch.reminderEnabled = data.reminderEnabled ?? false
  if ('reminderTimes' in data) patch.reminderTimes = data.reminderTimes ?? []
  if ('scheduledReminders' in data) patch.scheduledReminders = data.scheduledReminders ?? []
  if ('slipAlertEnabled' in data) patch.slipAlertEnabled = data.slipAlertEnabled ?? false
  if ('checklistItems' in data) patch.checklistItems = data.checklistItems ?? []
  if ('goalIds' in data) patch.linkedGoals = findCachedGoals(queryClient, data.goalIds)
  if ('endDate' in data) patch.endDate = data.endDate ?? null

  if (data.clearEndDate) {
    patch.endDate = null
  }

  if (data.isGeneral) {
    patch.frequencyUnit = null
    patch.frequencyQuantity = null
    patch.days = []
    patch.reminderEnabled = false
    patch.reminderTimes = []
    patch.scheduledReminders = []
    patch.dueTime = null
    patch.dueEndTime = null
    patch.endDate = null
  }

  return patch
}

export function useLogHabit() {
  const queryClient = useQueryClient()
  const { setStreakCelebration, checkAllDoneCelebration, activeFilters } = useUIStore.getState()

  return useMutation({
    mutationFn: ({
      habitId,
      date,
    }: {
      habitId: string
      date?: string
    }) => logHabitAction(habitId, date ? { date } : undefined),

    onMutate: ({ habitId, date }) => {
      void queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      if (!date) {
        queryClient.setQueriesData<HabitScheduleItem[]>(
          { queryKey: habitKeys.lists() },
          (old) => old ? optimisticToggleCompletion(old, habitId) : old,
        )
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) {
            queryClient.setQueryData(key, data)
          }
        }
      }
    },

    onSuccess: (response, variables) => {
      const loggedHabit = queryClient
        .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
        .flatMap(([, items]) => items ?? [])
        .find((item) => item.id === variables.habitId)

      if (!loggedHabit?.isBadHabit && response?.isFirstCompletionToday && response.currentStreak > 0) {
        setStreakCelebration({ streak: response.currentStreak })
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, currentStreak: response.currentStreak } : old,
        )
      }

      if (response?.linkedGoalUpdates?.length) {
        queryClient.setQueriesData<Goal[]>(
          { queryKey: goalKeys.lists() },
          (old) => old ? applyLinkedGoalUpdates(old, response.linkedGoalUpdates!) : old,
        )
      }

      if (!loggedHabit?.isBadHabit && (response?.xpEarned || response?.newAchievementIds?.length)) {
        queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
          if (!old) return old
          return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
        })
      }

      const habitsData = queryClient.getQueryData<HabitScheduleItem[]>(
        habitKeys.list(activeFilters as Record<string, unknown>),
      )
      if (habitsData) {
        const normalized = normalizeHabits(habitsData)
        checkAllDoneCelebration(normalized)
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) =>
      skipHabitAction(habitId, date),

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      if (!date) {
        queryClient.setQueriesData<HabitScheduleItem[]>(
          { queryKey: habitKeys.lists() },
          (old) => {
            if (!old) return old
            const habit = findHabitInList(old, habitId)
            if (!habit) return old
            return optimisticPatchHabit(old, habitId, buildOptimisticSkipPatch(habit))
          },
        )
      }

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        for (const [key, data] of context.previousLists) {
          if (data) queryClient.setQueryData(key, data)
        }
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateHabitRequest) => createHabitAction(data),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ habitId, data }: { habitId: string; data: UpdateHabitRequest }) =>
      updateHabitAction(habitId, data),

    onMutate: async ({ habitId, data }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      const patch = buildOptimisticHabitPatch(queryClient, data)
      updateHabitLists(queryClient, (items) =>
        optimisticPatchHabit(items, habitId, patch),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
    },

    onSettled: (_data, _err, { habitId }) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) => deleteHabitAction(habitId),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useMutation({
    mutationFn: (data: ReorderHabitsRequest) => reorderHabitsAction(data),

    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) =>
        applyReorderPositions(items, data.positions),
      )

      return { previousLists }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousLists) {
        restoreHabitLists(queryClient, context.previousLists)
      }
      showError(t('habits.reorderFailed'))
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitId: string) => duplicateHabitAction(habitId),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      habitId,
      items,
    }: {
      habitId: string
      items: ChecklistItem[]
    }) => updateChecklistAction(habitId, items),

    onMutate: async ({ habitId, items }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: habitKeys.lists() }),
        queryClient.cancelQueries({ queryKey: habitKeys.detail(habitId) }),
        queryClient.cancelQueries({ queryKey: habitKeys.fullDetail(habitId) }),
      ])

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })
      const previousDetail = queryClient.getQueryData<HabitDetail>(habitKeys.detail(habitId))
      const previousFullDetail = queryClient.getQueryData<HabitFullDetail>(
        habitKeys.fullDetail(habitId),
      )

      queryClient.setQueriesData<HabitScheduleItem[]>(
        { queryKey: habitKeys.lists() },
        (old) => old ? optimisticUpdateChecklist(old, habitId, items) : old,
      )
      queryClient.setQueryData<HabitDetail>(habitKeys.detail(habitId), (old) =>
        old ? { ...old, checklistItems: items } : old,
      )
      queryClient.setQueryData<HabitFullDetail>(habitKeys.fullDetail(habitId), (old) =>
        old ? { ...old, habit: { ...old.habit, checklistItems: items } } : old,
      )

      return { previousLists, previousDetail, previousFullDetail }
    },

    onError: (_err, { habitId }, context) => {
      if (!context) return
      for (const [key, data] of context.previousLists) {
        if (data) queryClient.setQueryData(key, data)
      }
      if (context.previousDetail) {
        queryClient.setQueryData(habitKeys.detail(habitId), context.previousDetail)
      }
      if (context.previousFullDetail) {
        queryClient.setQueryData(habitKeys.fullDetail(habitId), context.previousFullDetail)
      }
    },

    onSettled: (_data, _err, { habitId }) => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      parentId,
      data,
    }: {
      parentId: string
      data: CreateSubHabitRequest
    }) => createSubHabitAction(parentId, data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: string
      data: MoveHabitParentRequest
    }) => moveHabitParentAction(habitId, data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BulkCreateRequest) => bulkCreateHabitsAction(data),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (habitIds: string[]) => bulkDeleteHabitsAction(habitIds),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: BulkLogItemRequest[]) => bulkLogHabitsAction(items),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: BulkSkipItemRequest[]) => bulkSkipHabitsAction(items),

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
