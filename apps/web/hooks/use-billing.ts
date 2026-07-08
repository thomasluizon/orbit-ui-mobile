'use client'

import { useQuery } from '@tanstack/react-query'
import { subscriptionKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { BillingDetails } from '@orbit/shared/types/subscription'
import { isMissingBillingStatus } from '@orbit/shared/utils'

async function fetchBillingDetails(): Promise<BillingDetails | null> {
  const res = await fetch(API.subscription.billing)
  if (isMissingBillingStatus(res.status)) {
    return null
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null
    throw new Error(body?.error ?? body?.message ?? `Failed with status ${res.status}`)
  }
  return res.json() as Promise<BillingDetails>
}

export function useBilling(enabled = false) {
  const query = useQuery({
    queryKey: subscriptionKeys.billing(),
    queryFn: fetchBillingDetails,
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  return {
    ...query,
    billing: query.data ?? null,
  }
}
