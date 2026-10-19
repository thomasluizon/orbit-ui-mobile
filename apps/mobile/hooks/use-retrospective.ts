import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { i18n } from '@/lib/i18n'
import { type RetrospectivePeriod, buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import { apiClient } from '@/lib/api-client'

export function useProgressRetrospective(period: RetrospectivePeriod = 'month', enabled = true) {
  return useQuery({
    queryKey: habitKeys.retrospective(period),
    queryFn: () =>
      apiClient(
        buildRetrospectiveRequestUrl(period, i18n.language),
        undefined,
        retrospectiveResponseSchema,
      ),
    enabled,
    staleTime: QUERY_STALE_TIMES.gamification,
  })
}
