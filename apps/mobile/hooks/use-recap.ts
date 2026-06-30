import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Recap } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl, type RecapSharePeriod } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

/** Fetches the gamification recap for a share-card period. Lazy by default — enable it when the share sheet opens. */
export function useRecap(period: RecapSharePeriod, enabled = false) {
  return useQuery({
    queryKey: gamificationKeys.recap(period),
    queryFn: () => apiClient<Recap>(buildRecapRequestUrl(period)),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}
