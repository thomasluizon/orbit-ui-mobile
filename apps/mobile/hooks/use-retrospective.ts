import { useQuery } from '@tanstack/react-query'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { retrospectiveResponseSchema } from '@orbit/shared/types/gamification'
import { i18n } from '@/lib/i18n'
import { buildRetrospectiveRequestUrl } from '@orbit/shared/utils/retrospective'
import { apiClient } from '@/lib/api-client'

export function useProgressRetrospective(enabled: boolean) {
  return useQuery({
    queryKey: habitKeys.retrospective('month'),
    queryFn: () =>
      apiClient(
        buildRetrospectiveRequestUrl('month', i18n.language),
        undefined,
        retrospectiveResponseSchema,
      ),
    staleTime: QUERY_STALE_TIMES.gamification,
    enabled,
  })
}
