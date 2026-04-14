import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { subscriptionKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import {
  applySubscriptionDiscount,
  formatPrice,
  monthlyEquivalent,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

export function useSubscriptionPlans() {
  const query = useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: () => apiClient<SubscriptionPlans>(API.subscription.plans),
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
    refetchOnMount: 'always',
  })

  const plans = query.data ?? null

  const discountedAmount = useCallback(
    (unitAmount: number): number => {
      return applySubscriptionDiscount(unitAmount, plans?.couponPercentOff)
    },
    [plans?.couponPercentOff],
  )

  return {
    ...query,
    plans,
    formatPrice,
    discountedAmount,
    monthlyEquivalent,
  }
}
export { formatPrice, monthlyEquivalent } from '@orbit/shared/utils'
