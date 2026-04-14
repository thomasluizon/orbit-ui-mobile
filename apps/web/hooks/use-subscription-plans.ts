'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { subscriptionKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import {
  applySubscriptionDiscount,
  formatPrice,
  getClientTimeZone,
  monthlyEquivalent,
} from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'

export function useSubscriptionPlans() {
  const plansUrl = (() => {
    const timeZone = getClientTimeZone()
    return timeZone
      ? `${API.subscription.plans}?timeZone=${encodeURIComponent(timeZone)}`
      : API.subscription.plans
  })()

  const query = useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: () => fetchJson<SubscriptionPlans>(plansUrl),
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
