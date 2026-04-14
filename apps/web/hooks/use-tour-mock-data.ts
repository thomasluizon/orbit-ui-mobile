'use client'

import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { habitKeys, goalKeys, tagKeys, gamificationKeys } from '@orbit/shared/query'
import { createTourMockHabits, createTourMockGoals, createTourMockTags } from '@orbit/shared/tour'
import { formatAPIDate } from '@orbit/shared/utils'
import type { HabitScheduleItem, Goal, StreakInfo } from '@orbit/shared/types'

/**
 * Injects/restores mock data into TanStack Query cache during the tour.
 * Mock data is translated to the user's current locale.
 */
export function useTourMockData() {
  const queryClient = useQueryClient()
  const t = useTranslations()

  const inject = useCallback(() => {
    const today = formatAPIDate(new Date())
    const mockHabits = createTourMockHabits(today, t)
    const mockGoals = createTourMockGoals(t)
    const mockTags = createTourMockTags(t)

    // Pause refetches
    queryClient.setQueryDefaults(habitKeys.lists(), { staleTime: Infinity, refetchInterval: false })
    queryClient.setQueryDefaults(goalKeys.lists(), { staleTime: Infinity })
    queryClient.setQueryDefaults(tagKeys.lists(), { staleTime: Infinity })

    // Inject mock habits into ALL habit list queries
    queryClient.setQueriesData<HabitScheduleItem[]>(
      { queryKey: habitKeys.lists() },
      () => mockHabits,
    )

    // Also set for the specific today filter in case no query exists yet
    const todayFilters = { dateFrom: today, dateTo: today, includeOverdue: true }
    queryClient.setQueryData(habitKeys.list(todayFilters as Record<string, unknown>), mockHabits)

    // Inject mock goals
    queryClient.setQueriesData<Goal[]>(
      { queryKey: goalKeys.lists() },
      () => mockGoals,
    )
    queryClient.setQueryData(goalKeys.list({}), mockGoals)

    // Inject mock tags
    queryClient.setQueryData(tagKeys.lists(), mockTags)

    // Mock streak if user has none
    queryClient.setQueryDefaults(gamificationKeys.all, { staleTime: Infinity })
    queryClient.setQueryData(gamificationKeys.streak(), (old: StreakInfo | undefined) => {
      if (old && old.currentStreak > 0) return old
      return {
        currentStreak: 1,
        longestStreak: 1,
        lastActiveDate: today,
        freezesUsedThisMonth: 0,
        freezesAvailable: 0,
        maxFreezesPerMonth: 3,
        maxFreezesHeld: 3,
        streakFreezeBalance: 0,
        daysUntilNextFreeze: 7,
        progressToNextFreeze: 1,
        isAtHeldCap: false,
        isFrozenToday: false,
        recentFreezeDates: [],
      } satisfies StreakInfo
    })
  }, [queryClient, t])

  const restore = useCallback(() => {
    queryClient.setQueryDefaults(habitKeys.lists(), { staleTime: undefined, refetchInterval: undefined })
    queryClient.setQueryDefaults(goalKeys.lists(), { staleTime: undefined })
    queryClient.setQueryDefaults(tagKeys.lists(), { staleTime: undefined })

    queryClient.setQueryDefaults(gamificationKeys.all, { staleTime: undefined })

    queryClient.invalidateQueries({ queryKey: habitKeys.all })
    queryClient.invalidateQueries({ queryKey: goalKeys.all })
    queryClient.invalidateQueries({ queryKey: tagKeys.all })
    queryClient.invalidateQueries({ queryKey: gamificationKeys.all })
  }, [queryClient])

  return { inject, restore }
}
