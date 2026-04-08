import { useQuery } from '@tanstack/react-query'
import { subscriptionKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import { isMissingBillingError } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

export function useBilling(enabled = false) {
  const query = useQuery({
    queryKey: [...subscriptionKeys.all, 'billing'] as const,
    queryFn: async (): Promise<BillingDetails | null> => {
      try {
        return await apiClient<BillingDetails>(API.subscription.billing)
      } catch (err: unknown) {
        // 404 = no Stripe subscription (e.g. lifetime Pro) -- not an error
        if (isMissingBillingError(err)) {
          return null
        }
        throw err
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  return {
    ...query,
    billing: query.data ?? null,
  }
}
