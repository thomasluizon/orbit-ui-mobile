import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { recapResponseSchema } from '@orbit/shared/types/gamification'
import { API } from '@orbit/shared/api'
import type { RetrospectivePeriod } from '@orbit/shared/utils/retrospective'
import { apiClient } from '@/lib/api-client'

export function useProgressRecap(period: RetrospectivePeriod, enabled = true) {
  return useQuery({
    queryKey: gamificationKeys.recap(period),
    queryFn: () => apiClient(`${API.gamification.recap}?${new URLSearchParams({ period }).toString()}`, undefined, recapResponseSchema),
    enabled,
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}
