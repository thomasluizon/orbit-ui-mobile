'use client'

import { useQuery } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import { fetchJson } from '@/lib/api-fetch'

export function useProgressRetrospective(enabled: boolean) {
  const locale = useLocale()
  return useQuery({
    queryKey: habitKeys.retrospective('month'),
    queryFn: () =>
      fetchJson(
        buildRetrospectiveRequestUrl('month', locale),
        retrospectiveResponseSchema,
      ),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}
