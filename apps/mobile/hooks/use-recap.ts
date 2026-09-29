import { useQuery } from '@tanstack/react-query'
import { gamificationKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import type { Recap } from '@orbit/shared/types/gamification'
import { buildRecapRequestUrl, withShareLinkOrigin, type RecapSharePeriod } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { APP_LINK_ORIGIN } from '@/lib/app-link-origin'

/** Fetches the gamification recap for a share-card period. Lazy by default — enable it when the share sheet opens. */
export function useRecap(period: RecapSharePeriod, enabled = false) {
  return useQuery({
    queryKey: gamificationKeys.recap(period),
    queryFn: async () => {
      const recap = await apiClient<Recap>(buildRecapRequestUrl(period))
      return { ...recap, shareDeepLink: withShareLinkOrigin(recap.shareDeepLink, APP_LINK_ORIGIN) }
    },
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}
