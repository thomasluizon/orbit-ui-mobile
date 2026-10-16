import { API } from '../api'
import type { DailySummaryResponse } from '../types/daily-summary'
import { getDailySummaryTimeBucket, getMsUntilNextDailySummaryTimeBucket } from '../utils/habit-query'
import { habitKeys } from './keys'
import { QUERY_STALE_TIMES } from './options'

export const AI_SUMMARY_CLAMP_CHARS = 140

export interface DailySummaryOptions {
  date: string
  locale: string
  hasProAccess: boolean
  aiSummaryEnabled: boolean
}

export function dailySummaryQueryOptions(
  { date, locale, hasProAccess, aiSummaryEnabled }: DailySummaryOptions,
  fetchSummary: (url: string) => Promise<DailySummaryResponse>,
) {
  const params = new URLSearchParams({ dateFrom: date, dateTo: date, language: locale })
  return {
    queryKey: habitKeys.summary(date, date, locale, getDailySummaryTimeBucket()),
    queryFn: () => fetchSummary(`${API.habits.summary}?${params.toString()}`),
    enabled: hasProAccess && aiSummaryEnabled && !!date,
    staleTime: QUERY_STALE_TIMES.habits,
    refetchInterval: () => getMsUntilNextDailySummaryTimeBucket(),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  }
}
