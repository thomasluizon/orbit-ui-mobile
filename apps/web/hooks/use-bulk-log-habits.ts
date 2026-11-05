'use client'

import { captureException } from '@sentry/nextjs'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useQueryClient } from '@tanstack/react-query'
import { profileKeys,habitKeys,updateHabitListsForDate,getTodayHabitList,invalidateDerivedHabitLogQueries,goalKeys,gamificationKeys } from '@orbit/shared/query'
import { ApiClientError,buildUnresolvedBulkFailures,getBulkCompletionReplay,normalizeBulkCompletionInput,isBulkGatewayFailure,type BulkCompletionInput,type BulkRetryChunk,getAccountDay,findHabitInList,buildSuccessfulLogPatch,deriveBulkLogStreakTransition,normalizeHabits,buildChildrenIndex } from '@orbit/shared/utils'
import { optimisticPatchHabit } from '@/lib/habit-optimistic-helpers'
import { snapshotHabitLists,updateHabitLists,restoreHabitLists,type HabitListSnapshots } from '@/lib/habit-mutation-helpers'
import type { BulkLogItemRequest,BulkLogResult,HabitScheduleItem } from '@orbit/shared/types/habit'
import type { Profile } from '@orbit/shared/types/profile'
import { bulkLogHabits as bulkLogHabitsAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useUIStore } from '@/stores/ui-store'
import { captureAccountIntent } from '@/lib/client-action'
import { invalidateHabitStructureQueries } from './use-habit-mutation-shared'

function restoreRejectedBulkItems(
  queryClient: ReturnType<typeof useQueryClient>,
  previousLists: HabitListSnapshots,
  results: readonly { habitId: string; status: 'Success' | 'Failed' }[],
  ambiguousIds: readonly string[],
): void {
  const rejectedHabitIds = [...ambiguousIds, ...results.flatMap((item) =>
    item.status !== 'Success' ? [item.habitId] : [],
  )]

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

export function useBulkLogHabits() {
  const queryClient = useQueryClient()
  const { checkAllDoneCelebration, showStreakMoment } = useUIStore.getState()

  return useAccountScopedMutation({
    mutationFn: async (input: BulkCompletionInput<BulkLogItemRequest>, intendedAccountId) => {
      const { items } = normalizeBulkCompletionInput(input)
      const ambiguousIds: string[] = []
      const retryChunks: BulkRetryChunk<BulkLogItemRequest>[] = []
      const account = captureAccountIntent()
      const results: BulkLogResult['results'] = []
      const streakResponses: BulkLogResult[] = []
      const replay = getBulkCompletionReplay(queryClient, getAccountGeneration(), 'log')
      for (const chunk of replay.prepare(input, () => crypto.randomUUID())) {
        if (!account.stillCurrent()) break
        try {
          replay.markAttempted(chunk)
          const response = await bulkLogHabitsAction(
            chunk.items,
            intendedAccountId,
            chunk.idempotencyKey,
          )
          replay.resolve(chunk.idempotencyKey)
          const chunkResponse = { ...response, results: response.results.map((result) => ({ ...result, index: chunk.indices[result.index]! })) }
          streakResponses.push(chunkResponse)
          results.push(...chunkResponse.results)
        } catch (error) {
          if (reportsAccountChanged(error)) throw error
          // WHY: Server Action transport errors can omit HTTP status: https://github.com/thomasluizon/orbit-tickets/issues/2004.
          if (isBulkGatewayFailure(error) || !(error instanceof ApiClientError)) {
            ambiguousIds.push(...chunk.items.map(item => item.habitId))
            retryChunks.push({ items: chunk.items, idempotencyKey: chunk.idempotencyKey })
            continue
          }
          replay.resolve(chunk.idempotencyKey)
          const index = chunk.indices[0]!
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
      return { results, streakResponses, ambiguousIds, retryChunks }
    },

    onMutate: async (input) => {
      const { items } = normalizeBulkCompletionInput(input)
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

    onSuccess: (result, input, context) => {
      const { items } = normalizeBulkCompletionInput(input)
      restoreRejectedBulkItems(queryClient, context.previousLists, result.results, result.ambiguousIds)
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
      void profileRefresh?.then(() => {
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
      }).catch((error: unknown) => captureException(error))
    },

    onSettled: () => {
      invalidateDerivedHabitLogQueries(queryClient)
      invalidateHabitStructureQueries(queryClient)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    },
  })
}
