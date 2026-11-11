'use client'

import { applyHabitLogSuccess,checkTodayCompletionAfterLog,setOptimisticCalendarHabitLog,rollbackHabitLogCalendars,setOptimisticHabitLogs,rollbackOptimisticHabitLogsCache,optimisticHabitLogId } from '@orbit/shared/hooks'

import type { UseMutationOptions } from '@tanstack/react-query'
import type { LogHabitResponse } from '@orbit/shared/types/habit'


import { checkCompletionAfterSkip } from '@orbit/shared/query/skip-completion'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { invalidateDerivedHabitLogQueries,habitKeys,goalKeys,gamificationKeys,profileKeys,applyCachedHabitSkip,rollbackDatedHabitLists,updateHabitListsForDate,invalidateHabitDependents,clearCachedOptimisticSkip,restoreCachedHabitSkip,getTodayHabitListAfterRefetch } from '@orbit/shared/query'
import { findHabitInList,getAccountDay,normalizeHabits,buildChildrenIndex,optimisticSetDatedCompletion,getFriendlyErrorMessage } from '@orbit/shared/utils'
import { optimisticToggleCompletion } from '@/lib/habit-optimistic-helpers'
import { restoreHabitLists,snapshotHabitLists,type HabitListSnapshots } from '@/lib/habit-mutation-helpers'
import type { CalendarMonthResponse } from '@orbit/shared/types/habit'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { Profile } from '@orbit/shared/types/profile'
import { logHabit as logHabitAction,skipHabit as skipHabitAction,undoSkipHabit as undoSkipHabitAction } from '@/lib/actions/habits'
import { useAccountScopedMutation } from '@/hooks/use-account-scoped-mutation'
import { useUIStore } from '@/stores/ui-store'
import { useEngagementPromptStore } from '@/stores/referral-prompt-store'
import { useAppToast } from '@/hooks/use-app-toast'
import { useUndoToast } from '@/hooks/use-undo-toast'
import { captureHabitLogged } from '@/lib/posthog'
import { captureAccountIntent,reportAccountChanged } from '@/lib/client-action'


export function useLogHabit() {
  const context = useLogHabitContext()
  return useAccountScopedMutation({
    mutationFn: ({
      habitId,
      date,
    }: {
      habitId: string
      date?: string
      intent: 'log' | 'unlog'
    }, intendedAccountId) => logHabitAction(habitId, date ? { date } : undefined, intendedAccountId),

    onMutate: createLogHabitOnMutate(context),

    onError: createLogHabitOnError(context),

    onSuccess: createLogHabitOnSuccess(context),

    onSettled: createLogHabitOnSettled(context),
  })
}

export function useSkipHabit() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const showUndoToast = useUndoToast()
  const { showError } = useAppToast()
  type UndoInput = { habitId: string; skipId: string; previousLists: HabitListSnapshots; occurrence: { date: string; postponed: boolean }; onUndo?: () => void; intent: ReturnType<typeof captureAccountIntent> }
  const undoSkip = useAccountScopedMutation<void, Error, UndoInput>({
    mutationFn: (input, intendedAccountId) =>
      undoSkipHabitAction(input.habitId, input.skipId, intendedAccountId),
    onSuccess: (_result, { habitId, previousLists, occurrence, onUndo }) => {
      onUndo?.()
      restoreCachedHabitSkip(queryClient, previousLists, habitId, occurrence)
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
    onError: (error, input) => {
      showUndoToast(getFriendlyErrorMessage(error, t, 'undo.restoreFailed'), () => {
        if (!input.intent.stillCurrent()) { reportAccountChanged(); return }
        undoSkip.mutate(input)
      })
    },
  })

  return useAccountScopedMutation({
    mutationFn: async ({ habitId, date }: { habitId: string; date?: string; onUndo?: () => void }, intendedAccountId) => {
      const skipId = crypto.randomUUID()
      await skipHabitAction(habitId, { date, skipId }, intendedAccountId)
      return { skipId }
    },
    onMutate: async ({ habitId, date }) => {
      const account = captureAccountIntent()
      await queryClient.cancelQueries({ queryKey: habitKeys.lists() })
      if (!account.stillCurrent()) throw new Error('Account changed')
      const previousLists = snapshotHabitLists(queryClient)
      const previous = previousLists.flatMap(([, items]) => items ? [findHabitInList(items, habitId)] : [])
        .find((habit) => habit !== null)
      const skippedDate = date ?? getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
      applyCachedHabitSkip(queryClient, habitId, skippedDate)
      return { previousLists, skippedDate, postponed: previous?.frequencyUnit === null }
    },
    onSuccess: ({ skipId }, { habitId, onUndo }, context) => {
      const intent = captureAccountIntent()
      showUndoToast(t(context.postponed ? 'undo.habitPostponed' : 'undo.habitSkipped'), () => {
        if (!intent.stillCurrent()) { reportAccountChanged(); return }
        undoSkip.mutate({
          habitId, skipId, previousLists: context.previousLists,
          occurrence: { date: context.skippedDate, postponed: context.postponed }, onUndo, intent
        })
      })
    },
    onError: (error, _variables, context) => {
      if (context) restoreHabitLists(queryClient, context.previousLists)
      showError(getFriendlyErrorMessage(error, t, 'undo.skipFailed'))
    },
    onSettled: (_result, error, { habitId }, context) => {
      if (error) return
      if (context) {
        clearCachedOptimisticSkip(queryClient, habitId, context.skippedDate)
        checkCompletionAfterSkip(queryClient, [{ habitId, date: context.skippedDate }],
          queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone, useUIStore.getState().checkAllDoneCelebration, context.previousLists)
      }
      invalidateHabitDependents(queryClient, habitId)
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

function useLogHabitContext() {
  const queryClient = useQueryClient()
  const t = useTranslations()
  const { showError } = useAppToast()
  const { setStreakCelebration, showStreakMoment, checkAllDoneCelebration } = useUIStore.getState()
  return { queryClient, t, showError, setStreakCelebration, showStreakMoment, checkAllDoneCelebration }
}

type HabitLogVariables = { habitId: string; date?: string; intent: 'log' | 'unlog' }
type HabitLogSnapshot = { occurrenceDate: string; previousLists: HabitListSnapshots; previousLogs: HabitLog[] | undefined; previousCalendars: readonly (readonly [readonly unknown[], CalendarMonthResponse | undefined])[]; hadPendingListRefetch: boolean; retryAllDoneDate: string | null }
type HabitLogOptions = UseMutationOptions<LogHabitResponse, Error, HabitLogVariables, HabitLogSnapshot>

function createLogHabitOnMutate(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient } = context
  const callback: NonNullable<HabitLogOptions['onMutate']> = ({ habitId, date, intent }) => {
    const occurrenceDate = date ?? getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
    const hadPendingListRefetch = queryClient.isFetching({ queryKey: habitKeys.lists() }) > 0
    /** Start canceling refetches without delaying the optimistic completion. */
    void queryClient.cancelQueries({ queryKey: habitKeys.lists() })
    if (date) void queryClient.cancelQueries({ queryKey: habitKeys.calendarPrefix() })

    const previousLists = snapshotHabitLists(queryClient)
    const previousCalendars = date
      ? queryClient.getQueriesData<CalendarMonthResponse>({
        queryKey: habitKeys.calendarPrefix(),
      })
      : []

    let previousLogs: HabitLog[] | undefined
    if (date) {
      const completed = intent === 'log'
      const optimisticLogId = optimisticHabitLogId(habitId, date)
      const createdAtUtc = new Date().toISOString()
      previousLogs = setOptimisticHabitLogs(queryClient, habitId, date, completed, createdAtUtc)
      updateHabitListsForDate(queryClient, date, (items) => optimisticSetDatedCompletion(items, habitId, date, completed, optimisticLogId), { includeUnfiltered: false })
      setOptimisticCalendarHabitLog(queryClient, habitId, date, completed, createdAtUtc)
    } else {
      updateHabitListsForDate(queryClient, occurrenceDate,
        (items) => optimisticToggleCompletion(items, habitId))
    }

    return { occurrenceDate, previousLists, previousLogs, previousCalendars, hadPendingListRefetch, retryAllDoneDate: null as string | null }
  }
  return callback
}

function createLogHabitOnError(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient, t, showError } = context
  const callback: NonNullable<HabitLogOptions['onError']> = (error, variables, context) => {
    if (!variables.date && context?.previousLists) {
      for (const [key, data] of context.previousLists) {
        if (data) {
          queryClient.setQueryData(key, data)
        }
      }
    }
    if (variables.date) {
      const date = variables.date
      const optimisticLogId = optimisticHabitLogId(variables.habitId, date)
      rollbackDatedHabitLists(queryClient, context?.previousLists ?? [], variables.habitId, date, optimisticLogId)
      if (context) rollbackOptimisticHabitLogsCache(queryClient, context.previousLogs, variables.habitId, date)
      rollbackHabitLogCalendars(queryClient, context?.previousCalendars ?? [], variables.habitId, date)
    }
    showError(getFriendlyErrorMessage(error, (key, values) => t(key, values), 'habits.detail.logError'), t('common.dismiss'))
  }
  return callback
}

function createLogHabitOnSuccess(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient, setStreakCelebration, showStreakMoment, checkAllDoneCelebration } = context
  const callback: NonNullable<HabitLogOptions['onSuccess']> = (response, variables, context: { occurrenceDate: string; hadPendingListRefetch: boolean; retryAllDoneDate: string | null } | undefined) => {
    captureHabitLogged()
    applyHabitLogSuccess(queryClient, response, variables, context, { setStreakCelebration, showStreakMoment,
      armMilestoneSharePrompt: useEngagementPromptStore.getState().armMilestoneSharePrompt,
    })

    const retryAllDoneDate = checkTodayCompletionAfterLog(queryClient, { ...variables, date: context?.occurrenceDate ?? variables.date },
      context?.hadPendingListRefetch ?? false, checkAllDoneCelebration)
    if (context) context.retryAllDoneDate = retryAllDoneDate
  }
  return callback
}

function createLogHabitOnSettled(context: ReturnType<typeof useLogHabitContext>) {
  const { queryClient, checkAllDoneCelebration } = context
  const callback: NonNullable<HabitLogOptions['onSettled']> = (_response, error, { habitId }, context) => {
    if (error) return
    invalidateDerivedHabitLogQueries(queryClient)
    if (!context?.retryAllDoneDate) {
      invalidateHabitDependents(queryClient, habitId)
      return
    }
    const today = context.retryAllDoneDate
    invalidateHabitDependents(queryClient, habitId, false)
    return getTodayHabitListAfterRefetch(queryClient, today).then((habitsData) => {
      if (!habitsData) return
      const normalized = normalizeHabits(habitsData)
      checkAllDoneCelebration(normalized, buildChildrenIndex(normalized), today, queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
    })
  }
  return callback
}
