import { useQuery } from '@tanstack/react-query'
import { subscriptionKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { formatPrice, monthlyEquivalent } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

export function useSubscriptionPlans() {
  const query = useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: () => apiClient<SubscriptionPlans>(API.subscription.plans),
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
    refetchOnMount: 'always',
  })

  const plans = query.data ?? null

  return {
    ...query,
    plans,
    formatPrice,
    monthlyEquivalent,
  }
}
export { formatPrice, monthlyEquivalent } from '@orbit/shared/utils'
