'use client'

import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'

import {
  useQueryClient,
} from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import {
  habitKeys, goalKeys, gamificationKeys, profileKeys,
  updateHabitListsForDate, invalidateHabitDependents,
} from '@orbit/shared/query'
import {
  applyLinkedGoalUpdates,
  buildOptimisticSkipPatch,
  findHabitInList,
  formatAPIDate,
  normalizeHabits,
  plural,
  optimisticRemoveHabits,
} from '@orbit/shared/utils'
import {
  optimisticPatchHabit,
  optimisticToggleCompletion,
  optimisticUpdateChecklist,
} from '@/lib/habit-optimistic-helpers'
import {
  applyReorderPositions,
  buildOptimisticHabitPatch,
  restoreHabitLists,
  snapshotHabitLists,
  updateHabitLists,
} from '@/lib/habit-mutation-helpers'
import type {
  HabitScheduleItem,
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
  restoreHabit as restoreHabitAction,
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
} from '@/lib/actions/habits'
import { getMilestoneShareStreakKey } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'

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

export function useLogHabit() {
  const queryClient = useQueryClient()
  const { setStreakCelebration, checkAllDoneCelebration, activeFilters } = useUIStore.getState()

  return useAccountScopedMutation({
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
        updateHabitListsForDate(queryClient, formatAPIDate(new Date()),
          (items) => optimisticToggleCompletion(items, habitId))
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
      const loggedHabit = findHabitInList(
        queryClient
          .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
          .flatMap(([, items]) => items ?? []),
        variables.habitId,
      )
      const countsTowardStreak = loggedHabit !== null && !loggedHabit.isBadHabit

      if (countsTowardStreak && response.isFirstCompletionToday && response.currentStreak > 0) {
        setStreakCelebration({ streak: response.currentStreak })
        queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
          old ? { ...old, currentStreak: response.currentStreak } : old,
        )
        const milestoneShareKey = getMilestoneShareStreakKey(response.currentStreak)
        if (milestoneShareKey) {
          useEngagementPromptStore.getState().armMilestoneSharePrompt(milestoneShareKey)
        }
      }

      if (response.linkedGoalUpdates?.length) {
        queryClient.setQueriesData<Goal[]>(
          { queryKey: goalKeys.lists() },
          (old) => old ? applyLinkedGoalUpdates(old, response.linkedGoalUpdates!) : old,
        )
        void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      }

      if (response.xpEarned || response.newAchievementIds?.length) {
        queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
          if (!old) return old
          return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
        })
        void queryClient.invalidateQueries({ queryKey: profileKeys.all })
      }

      if (response.isFirstCompletionToday || response.xpEarned || response.newAchievementIds?.length) {
        void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      }

      const habitsData = queryClient.getQueryData<HabitScheduleItem[]>(
        habitKeys.list(activeFilters),
      )
      if (habitsData) {
        const normalized = normalizeHabits(habitsData)
        checkAllDoneCelebration(normalized)
      }
    },

    onSettled: (_response, error, { habitId }) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
    },
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({ habitId, date }: { habitId: string; date?: string }) =>
      skipHabitAction(habitId, date),

    onMutate: async ({ habitId, date }) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })

      const previousLists = queryClient.getQueriesData<HabitScheduleItem[]>({
        queryKey: habitKeys.lists(),
      })

      if (!date) {
        updateHabitListsForDate(queryClient, formatAPIDate(new Date()), (items) => {
          const habit = findHabitInList(items, habitId)
          if (!habit) return items
          return optimisticPatchHabit(items, habitId, buildOptimisticSkipPatch(habit))
        })
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

    onSettled: (_response, error, { habitId }) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useCreateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: CreateHabitRequest) => createHabitAction(data),

    onSuccess: (result) => {
      useUIStore.getState().setLastCreatedHabitId(result.id)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
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

    onSettled: (_response, error, { habitId }) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
    },
  })
}

function invalidateHabitDeleteQueries(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
  void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
  void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
}

export function useRestoreHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showSuccess, showError } = useAppToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string) => restoreHabitAction(habitId),

    onSuccess: () => {
      invalidateHabitDeleteQueries(queryClient)
      showSuccess(t('undo.restored'))
    },

    onError: () => {
      showError(t('undo.restoreFailed'))
    },
  })
}

export function useDeleteHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: (habitId: string) => deleteHabitAction(habitId),

    onMutate: async (habitId) => {
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      const previousLists = snapshotHabitLists(queryClient)
      updateHabitLists(queryClient, (items) => optimisticRemoveHabits(items, [habitId]))
      return { previousLists }
    },

    onError: (_error, _habitId, context) => {
      if (!context?.previousLists) return
      restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (_data, habitId) => {
      showUndoToast(t('undo.habitDeleted'), () => restoreHabit.mutate(habitId))
    },

    onSettled: (_response, error, habitId) => {
      if (error) return
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useReorderHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()

  return useAccountScopedMutation({
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
    },
  })
}

export function useDuplicateHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (habitId: string) => duplicateHabitAction(habitId),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useUpdateChecklist() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
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
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.detail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.fullDetail(habitId) })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useCreateSubHabit() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      parentId,
      data,
    }: {
      parentId: string
      data: CreateSubHabitRequest
    }) => createSubHabitAction(parentId, data),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useMoveHabitParent() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: string
      data: MoveHabitParentRequest
    }) => moveHabitParentAction(habitId, data),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: BulkCreateRequest) => bulkCreateHabitsAction(data),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: (habitIds: string[]) => bulkDeleteHabitsAction(habitIds),

    onSuccess: (result) => {
      const deleted = result.results.filter((item) => item.status === 'Success')
      if (deleted.length === 0) return
      const cascadedIds = new Set(deleted.flatMap((item) => item.cascadedHabitIds ?? []))
      const restoreIds = deleted.map((item) => item.habitId).filter((id) => !cascadedIds.has(id))
      const message = plural(t('undo.habitsDeleted', { count: deleted.length }), deleted.length)
      showUndoToast(message, () => {
        for (const habitId of restoreIds) restoreHabit.mutate(habitId)
      })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.count() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (items: BulkLogItemRequest[]) => bulkLogHabitsAction(items),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (items: BulkSkipItemRequest[]) => bulkSkipHabitsAction(items),

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: habitKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.calendarPrefix() })
      void queryClient.invalidateQueries({ queryKey: habitKeys.summaryPrefix() })
    },
  })
}
