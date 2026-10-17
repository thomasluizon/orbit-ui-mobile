'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { type RetrospectivePeriod, buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import { fetchJson } from '@/lib/api-fetch'

export function useProgressRetrospective(period: RetrospectivePeriod = 'month', enabled = true) {
  const locale = useLocale()
  return useQuery({
    queryKey: habitKeys.retrospective(period),
    queryFn: () =>
      fetchJson(
        buildRetrospectiveRequestUrl(period, locale),
        retrospectiveResponseSchema,
        { handlesPayGate: true, handlesError: true },
      ),
    enabled,
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}
