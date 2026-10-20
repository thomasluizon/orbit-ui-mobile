import { useQuery } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { subscriptionKeys } from '@orbit/shared/query'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { apiClient } from '@/lib/api-client'

export function useSubscriptionStatus() {
  const query = useQuery({
    queryKey: subscriptionKeys.status(),
    queryFn: () => apiClient<SubscriptionStatus>(API.subscription.status),
    staleTime: 5 * 60 * 1000,
  })

  return { ...query, status: query.data ?? null }
}
