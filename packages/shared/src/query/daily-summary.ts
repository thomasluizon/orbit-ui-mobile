import { API } from '../api'
import type { DailySummaryResponse } from '../types/daily-summary'
import { getDailySummaryTimeBucket, getMsUntilNextDailySummaryTimeBucket } from '../utils/habit-query'
import { habitKeys } from './keys'
import { QUERY_STALE_TIMES } from './options'

export interface DailySummaryOptions {
  date: string
  locale: string
  timeZone: string | null
  hasProAccess: boolean
  aiSummaryEnabled: boolean
}

interface DailySummaryQueryConfiguration {
  queryKey: ReturnType<typeof habitKeys.summary>
  queryFn: () => Promise<DailySummaryResponse>
  enabled: boolean
  staleTime: number
  refetchInterval: () => number
  refetchIntervalInBackground: boolean
  refetchOnWindowFocus: boolean
}

export function dailySummaryQueryOptions(
  { date, locale, timeZone, hasProAccess, aiSummaryEnabled }: DailySummaryOptions,
  fetchSummary: (url: string) => Promise<DailySummaryResponse>,
): DailySummaryQueryConfiguration {
  const params = new URLSearchParams({ dateFrom: date, dateTo: date, language: locale })
  return {
    queryKey: habitKeys.summary(date, date, locale, getDailySummaryTimeBucket(new Date(), timeZone)),
    queryFn: () => fetchSummary(`${API.habits.summary}?${params.toString()}`),
    enabled: hasProAccess && aiSummaryEnabled && !!date,
    staleTime: QUERY_STALE_TIMES.habits,
    refetchInterval: () => getMsUntilNextDailySummaryTimeBucket(new Date(), timeZone),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  }
}
