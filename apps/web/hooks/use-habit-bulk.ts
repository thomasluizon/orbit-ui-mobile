'use client'

import { checkCompletionAfterSkip, settleBulkSkippedHabits } from '@orbit/shared/query/skip-completion'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { isCachedHabitDeleted, removeDeletedHabitQueries, invalidateBulkMoveParentQueries, invalidateDerivedHabitLogQueries, habitKeys, goalKeys, gamificationKeys, profileKeys, applyCachedHabitSkip, updateHabitListsForDate, getTodayHabitList } from '@orbit/shared/query'
import { buildUnresolvedBulkFailures, buildSuccessfulLogPatch, deriveBulkLogStreakTransition, findHabitInList, getAccountDay, normalizeHabits, buildChildrenIndex, plural } from '@orbit/shared/utils'
import { optimisticPatchHabit } from '@/lib/habit-optimistic-helpers'
import { restoreHabitLists, snapshotHabitLists, updateHabitLists, type HabitListSnapshots } from '@/lib/habit-mutation-helpers'
import type { HabitScheduleItem, HabitScheduleChild, BulkCreateRequest, BulkLogItemRequest, BulkSkipItemRequest, BulkDeleteResponse, BulkMutationOutcome, BulkLogResult, BulkSkipResult, BulkMoveHabitParentRequest } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import { deleteHabit as deleteHabitAction, bulkMoveHabitParent as bulkMoveHabitParentAction, bulkCreateHabits as bulkCreateHabitsAction, bulkLogHabits as bulkLogHabitsAction, bulkSkipHabits as bulkSkipHabitsAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useUIStore } from '@/stores/ui-store'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { captureAccountIntent } from '@/lib/client-action'
import { invalidateHabitInventoryQueries, invalidateHabitStructureQueries } from './use-habit-mutation-shared'
import { useRestoreHabit } from './use-habit-structure'

function restoreRejectedBulkItems(
  queryClient: ReturnType<typeof useQueryClient>,
  previousLists: HabitListSnapshots,
  results: readonly { habitId: string; status: 'Success' | 'Failed' }[],
): void {
  const rejectedHabitIds = results.flatMap((item) =>
    item.status !== 'Success' ? [item.habitId] : [],
  )

  for (const [queryKey, previousItems] of previousLists) {
    if (!previousItems) continue

    queryClient.setQueryData<HabitScheduleItem[]>(queryKey, (currentItems) => {
      if (!currentItems) return currentItems

      return rejectedHabitIds.reduce((nextItems, habitId) => {
        const previousHabit = findHabitInList(previousItems, habitId)
        return previousHabit
          ? optimisticPatchHabit(nextItems, habitId, {
            isCompleted: previousHabit.isCompleted,
          })
          : nextItems
      }, currentItems)
    })
  }
}

export function useBulkCreateHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: (data: BulkCreateRequest, intendedAccountId) =>
      bulkCreateHabitsAction(data, intendedAccountId),

    onSettled: () => {
      invalidateHabitInventoryQueries(queryClient)
    },
  })
}

function selectedDescendantsInSnapshots(
  snapshots: HabitListSnapshots,
  selectedIds: Set<string>,
): Set<string> {
  const descendants = new Set<string>()
  const visit = (habit: HabitScheduleItem | HabitScheduleChild, selectedAncestor: boolean) => {
    const selected = selectedIds.has(habit.id)
    if (selected && selectedAncestor) descendants.add(habit.id)
    for (const child of habit.children) visit(child, selectedAncestor || selected)
  }
  for (const [, habits] of snapshots) {
    for (const habit of habits ?? []) visit(habit, false)
  }
  return descendants
}

export function useBulkDeleteHabits() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const restoreHabit = useRestoreHabit()
  const showUndoToast = useUndoToast()

  return useAccountScopedMutation({
    mutationFn: async (
      habitIds: string[],
      intendedAccountId,
    ): Promise<BulkMutationOutcome<BulkDeleteResponse>> => {
      const account = captureAccountIntent()
      const results: BulkDeleteResponse['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0;index < habitIds.length;index += 4) {
        if (!account.stillCurrent()) break
        const chunk = habitIds.slice(index, index + 4)
        const outcomes = await Promise.allSettled(
          chunk.map(async (habitId) => {
            if (isCachedHabitDeleted(queryClient, habitId)) return
            await deleteHabitAction(habitId, intendedAccountId)
            if (account.stillCurrent()) await removeDeletedHabitQueries(queryClient, habitId, undefined, account.stillCurrent)
          }),
        )
        for (const outcome of outcomes) {
          if (outcome.status === 'rejected' && reportsAccountChanged(outcome.reason)) {
            throw outcome.reason
          }
        }
        outcomes.forEach((outcome, itemIndex) => {
          const habitId = chunk[itemIndex]
          if (!habitId) return
          if (outcome.status === 'rejected') {
            ambiguousIds.push(habitId)
            return
          }
          results.push({
            index: index + itemIndex,
            status: 'Success',
            habitId,
            error: null,
          })
        })
      }
      return { results, ambiguousIds }
    },

    onMutate: async () => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.all })
      if (!account.stillCurrent()) throw new Error('Account changed')
      return { previousLists: snapshotHabitLists(queryClient) }
    },

    onSuccess: (result, _habitIds, context) => {
      const account = captureAccountIntent()
      const deleted = result.results.filter((item) => item.status === 'Success')
      if (deleted.length === 0) return
      const selectedIds = new Set(deleted.map((item) => item.habitId))
      const selectedDescendants = selectedDescendantsInSnapshots(context.previousLists, selectedIds)
      const restoreIds = deleted.map((item) => item.habitId)
        .filter((id) => !selectedDescendants.has(id))
      const message = plural(t('undo.habitsDeleted', { count: deleted.length }), deleted.length)
      showUndoToast(message, () => {
        if (!account.stillCurrent()) return
        for (const habitId of restoreIds) restoreHabit.mutate(habitId)
      })
    },

    onSettled: () => {
      invalidateHabitInventoryQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useBulkLogHabits() {
  const queryClient = useQueryClient()
  const { checkAllDoneCelebration, showStreakMoment } = useUIStore.getState()

  return useAccountScopedMutation({
    mutationFn: async (items: BulkLogItemRequest[], intendedAccountId): Promise<BulkLogResult & { streakResponses: BulkLogResult[] }> => {
      const account = captureAccountIntent()
      const results: BulkLogResult['results'] = []
      const streakResponses: BulkLogResult[] = []
      for (let index = 0;index < items.length;index += 100) {
        if (!account.stillCurrent()) break
        try {
          const response = await bulkLogHabitsAction(
            items.slice(index, index + 100),
            intendedAccountId,
          )
          const chunkResponse = { ...response, results: response.results.map((result) => ({ ...result, index: result.index + index })) }
          streakResponses.push(chunkResponse)
          results.push(...chunkResponse.results)
        } catch (error) {
          if (reportsAccountChanged(error)) throw error
          results.push(...buildUnresolvedBulkFailures(
            items.slice(index),
            index,
            error,
            (item, failureIndex, message) => ({
              index: failureIndex,
              status: 'Failed' as const,
              habitId: item.habitId,
              logId: null,
              error: message,
            }),
          ))
          break
        }
      }
      return { results, streakResponses }
    },

    onMutate: async (items) => {
      const occurrenceDate = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      const account = captureAccountIntent()

      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (!account.stillCurrent()) throw new Error('Account changed')
      const previousLists = snapshotHabitLists(queryClient)
      const completedIds = items.map((item) => item.habitId)
      updateHabitLists(queryClient, (currentItems) =>
        completedIds.reduce(
          (nextItems, habitId) => optimisticPatchHabit(nextItems, habitId, { isCompleted: true }),
          currentItems,
        ),
      )
      return { previousLists, account, occurrenceDate }
    },

    onError: (_error, _items, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result, items, context) => {
      restoreRejectedBulkItems(queryClient, context.previousLists, result.results)
      const profileRefresh = result.results.some((item) => item.status === 'Success')
        ? queryClient.invalidateQueries({ queryKey: profileKeys.all }) : null
      const today = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      const successfulEntries = result.results.filter((entry) => {
        const item = items[entry.index]
        return entry.status === 'Success' && item?.habitId === entry.habitId &&
          (item.date ?? context.occurrenceDate) === today
      })
      const successfulIds = successfulEntries.map((entry) => entry.habitId)
      if (successfulIds.length === 0) return
      updateHabitListsForDate(queryClient, today, (habits) =>
        successfulIds.reduce((current, id) => {
          const habit = findHabitInList(current, id)
          return habit ? optimisticPatchHabit(current, id, buildSuccessfulLogPatch(habit)) : current
        }, habits))
      return profileRefresh?.then(() => {
        const profile = queryClient.getQueryData<Profile>(profileKeys.detail())
        if (!profile || !context.account.stillCurrent() || today !== getAccountDay(new Date(), profile.timeZone)) return
        const { previousStreak, currentStreak, countsTowardStreak } = deriveBulkLogStreakTransition(
          result.streakResponses,
          successfulEntries,
          context.previousLists.flatMap(([, habits]) => habits ?? []),
        )
        if (currentStreak !== undefined) showStreakMoment(currentStreak, previousStreak, { date: today, timeZone: profile.timeZone, intent: 'log', countsTowardStreak })
        const habitsData = getTodayHabitList(queryClient, today)
        if (habitsData) {
          const normalized = normalizeHabits(habitsData)
          checkAllDoneCelebration(normalized, buildChildrenIndex(normalized), today, profile.timeZone)
        }
      })
    },

    onSettled: () => {
      invalidateDerivedHabitLogQueries(queryClient)
      invalidateHabitStructureQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}

export function useBulkSkipHabits() {
  const queryClient = useQueryClient()

  return useAccountScopedMutation({
    mutationFn: async (
      items: BulkSkipItemRequest[],
      intendedAccountId,
    ): Promise<BulkMutationOutcome<BulkSkipResult>> => {
      const account = captureAccountIntent()
      const results: BulkSkipResult['results'] = []
      const ambiguousIds: string[] = []
      for (let index = 0;index < items.length;index += 100) {
        if (!account.stillCurrent()) break
        const chunk = items.slice(index, index + 100)
        try {
          const response = await bulkSkipHabitsAction(chunk, intendedAccountId)
          results.push(...response.results.map((result) => ({ ...result, index: result.index + index })))
        } catch (error) {
          if (reportsAccountChanged(error)) throw error
          ambiguousIds.push(...chunk.map((item) => item.habitId))
        }
      }
      return { results, ambiguousIds }
    },

    onMutate: async (items) => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (!account.stillCurrent()) throw new Error('Account changed')
      const previousLists = snapshotHabitLists(queryClient)
      const occurrenceDate = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      for (const item of items) applyCachedHabitSkip(queryClient, item.habitId, item.date ?? occurrenceDate)

      return { previousLists, occurrenceDate }
    },

    onError: (_error, _items, context) => {
      if (context?.previousLists) restoreHabitLists(queryClient, context.previousLists)
    },

    onSuccess: (result, items, context) => {
      const acceptedIds = new Set(result.results.filter((entry) => entry.status === 'Success').map((entry) => entry.habitId))
      const rejectedIds = new Set([...result.ambiguousIds, ...items.filter((item) => !acceptedIds.has(item.habitId)).map((item) => item.habitId)])
      const confirmed = settleBulkSkippedHabits(queryClient, items, context.previousLists, rejectedIds, context.occurrenceDate)
      checkCompletionAfterSkip(queryClient, confirmed, queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone,
        useUIStore.getState().checkAllDoneCelebration, context.previousLists)
    },

    onSettled: () => {
      invalidateHabitStructureQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useBulkMoveHabitParent() {
  const queryClient = useQueryClient()
  return useAccountScopedMutation({
    mutationFn: (input: BulkMoveHabitParentRequest, intendedAccountId) =>
      bulkMoveHabitParentAction(input, intendedAccountId),
    onSuccess: () => invalidateBulkMoveParentQueries(queryClient),
  })
}
