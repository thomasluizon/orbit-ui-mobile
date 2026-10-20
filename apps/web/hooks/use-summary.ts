'use client'

import { useQuery } from '@tanstack/react-query'
import { dailySummaryQueryOptions, type DailySummaryOptions } from '@orbit/shared/query'
import { dailySummaryResponseSchema, type DailySummaryResponse } from '@orbit/shared/types/daily-summary'
import { fetchJson } from '@/lib/api-fetch'

export function useSummary(options: DailySummaryOptions) {
  const query = useQuery(dailySummaryQueryOptions(options, (url) =>
    fetchJson<DailySummaryResponse>(url, dailySummaryResponseSchema, { handlesError: true }),
  ))
  return {
    summary: query.data?.summary ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
