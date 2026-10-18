'use client'

import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { API } from '@orbit/shared/api'
import type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'
import { fetchJson } from '@/lib/api-fetch'

export function useProgressRecap(period: RetrospectivePeriod, enabled = true) {
  return useQuery({
    queryKey: gamificationKeys.recap(period),
    queryFn: () => fetchJson(`${API.gamification.recap}?${new URLSearchParams({ period }).toString()}`, recapResponseSchema, { handlesError: true }),
    enabled,
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}
