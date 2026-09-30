'use client'

import { formatAPIDateInTimeZone, selectAstraSuggestions } from '@orbit/shared/utils'
import type { AstraSuggestion } from '@orbit/shared/utils'
import { useHabits } from '@/hooks/use-habit-queries'
import { useProfile } from '@/hooks/use-profile'

/**
 * The drawn openers for the empty Astra conversation, or `null` while the first habit
 * list is still on its way, so the row appears once instead of growing under a finger.
 * Reads today's habit list, the same query Hoje runs, so an open conversation serves
 * it from cache.
 */
export function useAstraSuggestions(): AstraSuggestion[] | null {
  const { profile } = useProfile()
  const today = formatAPIDateInTimeZone(new Date(), profile?.timeZone)
  const habitsQuery = useHabits(
    { dateFrom: today, dateTo: today, includeOverdue: true },
    undefined,
    { completeDay: true },
  )

  if (habitsQuery.data === undefined && habitsQuery.fetchStatus === 'fetching') return null
  return selectAstraSuggestions(habitsQuery.data?.topLevelHabits ?? [], today)
}
