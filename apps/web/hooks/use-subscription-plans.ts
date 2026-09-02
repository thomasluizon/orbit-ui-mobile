'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { subscriptionKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import {
  applySubscriptionDiscount,
  formatPrice,
  getClientTimeZone,
  monthlyEquivalent,
} from '@orbit/shared/utils'
import { fetchJson, reportApiError } from '@/lib/api-fetch'

interface SubscriptionPlansQueryOptions {
  enabled?: boolean
  handlesError?: boolean
}

export function useSubscriptionPlans(options: SubscriptionPlansQueryOptions = {}) {
  const plansUrl = (() => {
    const timeZone = getClientTimeZone()
    return timeZone
      ? `${API.subscription.plans}?timeZone=${encodeURIComponent(timeZone)}`
      : API.subscription.plans
  })()

  const query = useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: () => fetchJson<SubscriptionPlans>(plansUrl, undefined, {
      handlesError: true,
    }),
    enabled: options.enabled,
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (!options.handlesError && query.error && query.isFetchedAfterMount) {
      reportApiError(query.error)
    }
  }, [options.handlesError, query.error, query.isFetchedAfterMount])

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
