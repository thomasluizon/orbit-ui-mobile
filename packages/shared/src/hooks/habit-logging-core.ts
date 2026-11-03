import type { QueryClient } from '@tanstack/query-core'
import type { HabitScheduleItem,CalendarMonthResponse,LogHabitResponse } from '../types/habit'
import type { Profile } from '../types/profile'
import type { Goal } from '../types/goal'
import type { GamificationProfile } from '../types/gamification'
import type { UIStoreState } from '../stores/ui-store'
import { getMilestoneShareStreakKey } from '../stores/engagement-prompt-store'
import { isStreakCelebrationMilestone } from '../stores/celebration-queue'
import { applyLinkedGoalUpdates,buildSuccessfulLogPatch,findHabitInList,getAccountDay,optimisticPatchHabit,optimisticSetCalendarHabitLog,rollbackOptimisticCalendarHabitLog } from '../utils'
import { checkTodayAllDoneOrDefer,updateHabitListsForDate,habitKeys,profileKeys,gamificationKeys,goalKeys } from '../query'

export interface HabitLogVariables { habitId: string; date?: string; intent: 'log' | 'unlog' }

interface HabitLogEffects extends Pick<UIStoreState, 'setStreakCelebration' | 'showStreakMoment'> {
  armMilestoneSharePrompt: (key: NonNullable<ReturnType<typeof getMilestoneShareStreakKey>>) => void
  onStartedStreak?: () => void
}

export function applyHabitLogSuccess(queryClient: QueryClient, response: LogHabitResponse, variables: HabitLogVariables, context: { occurrenceDate: string } | undefined, { setStreakCelebration, showStreakMoment, armMilestoneSharePrompt, onStartedStreak }: HabitLogEffects) {
    const loggedHabit = findHabitInList(
      queryClient
        .getQueriesData<HabitScheduleItem[]>({ queryKey: habitKeys.lists() })
        .flatMap(([, items]) => items ?? []),
      variables.habitId,
    )
    /**
     * The CELEBRATION still needs a known good habit, and deliberately so: a bad habit's
     * "streak" is consecutive abstinence, the opposite semantics, and an unresolvable habit
     * cannot be shown to be either. Celebrating on a guess is user-visible harm.
     */
    const countsTowardStreak = loggedHabit !== null && !loggedHabit.isBadHabit

    showStreakMoment(
      response.currentStreak,
      response.previousStreak ?? undefined,
      { ...variables, date: context?.occurrenceDate ?? variables.date, timeZone: queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone, countsTowardStreak },
    )
    const startsStreak = countsTowardStreak
      && response.isFirstCompletionToday
      && response.currentStreak > 0
    const today = getAccountDay(new Date(), queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone)
    const isTodayLog = (context?.occurrenceDate ?? variables.date ?? today) === today
    if (startsStreak && isTodayLog && isStreakCelebrationMilestone(response.currentStreak)) {
      setStreakCelebration({ streak: response.currentStreak })
    }
    if (startsStreak) {
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, currentStreak: response.currentStreak } : old,
      )
      const milestoneShareKey = getMilestoneShareStreakKey(response.currentStreak)
      if (milestoneShareKey) {
        armMilestoneSharePrompt(milestoneShareKey)
      }
      onStartedStreak?.()
    }

    if (response.linkedGoalUpdates?.length) {
      queryClient.setQueriesData<Goal[]>(
        { queryKey: goalKeys.lists() },
        (old) => old ? applyLinkedGoalUpdates(old, response.linkedGoalUpdates!) : old,
      )
      void queryClient.invalidateQueries({ queryKey: goalKeys.lists() })
      response.linkedGoalUpdates.forEach(({ goalId }) => {
        void queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
        void queryClient.invalidateQueries({ queryKey: goalKeys.metrics(goalId) })
      })
    }

    /**
     * Rewards the server already granted are reconciled from the RESPONSE, with no list-cache
     * requirement. The habit kind cannot change the answer here, so it is not consulted.
     */
    if (response.xpEarned || response.newAchievementIds?.length) {
      queryClient.setQueryData<GamificationProfile>(gamificationKeys.profile(), (old) => {
        if (!old) return old
        return { ...old, totalXp: old.totalXp + (response.xpEarned ?? 0) }
      })
    }
    if (variables.intent === 'unlog' || response.xpEarned || response.newAchievementIds?.length) {
      void queryClient.invalidateQueries({ queryKey: profileKeys.all })
    }

    if (response.isFirstCompletionToday || response.xpEarned || response.newAchievementIds?.length) {
      void queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
    }

}

/** Returns the day to recheck after the list refetch, when the complete Today list is not settled yet. */
export function checkTodayCompletionAfterLog(
  queryClient: QueryClient,
  variables: { habitId: string; date?: string; intent: 'log' | 'unlog' },
  hadPendingListRefetch: boolean,
  checkAllDoneCelebration: UIStoreState['checkAllDoneCelebration'],
): string | null {
  const timeZone = queryClient.getQueryData<Profile>(profileKeys.detail())?.timeZone
  const today = getAccountDay(new Date(), timeZone)
  if (variables.intent === 'unlog' || (variables.date && variables.date !== today)) return null
  updateHabitListsForDate(queryClient, today, (habits) => {
    const habit = findHabitInList(habits, variables.habitId)
    return habit ? optimisticPatchHabit(habits, variables.habitId, buildSuccessfulLogPatch(habit)) : habits
  })
  return checkTodayAllDoneOrDefer(queryClient, today, variables.date, hadPendingListRefetch,
    (...args) => checkAllDoneCelebration(...args, timeZone))
    ? today
    : null
}


export function setOptimisticCalendarHabitLog(queryClient: QueryClient, habitId: string, date: string, completed: boolean, optimisticLogId: string, createdAtUtc: string) {
  queryClient.setQueriesData<CalendarMonthResponse>({ queryKey: habitKeys.calendarPrefix() }, old => old
    ? optimisticSetCalendarHabitLog(old, habitId, date, completed, optimisticLogId, createdAtUtc) : old)
}

export function rollbackHabitLogCalendars(queryClient: QueryClient, previousCalendars: readonly (readonly [readonly unknown[], CalendarMonthResponse | undefined])[], habitId: string, date: string) {
  for (const [key, previousCalendar] of previousCalendars) {
    if (!previousCalendar) continue
    queryClient.setQueryData<CalendarMonthResponse>(key, currentCalendar => currentCalendar
      ? rollbackOptimisticCalendarHabitLog(currentCalendar, previousCalendar, habitId, date, `optimistic-log:${habitId}:${date}`) : currentCalendar)
  }
}
