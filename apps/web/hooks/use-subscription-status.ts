'use client'

import { useQuery } from '@tanstack/react-query'
import { API } from '@orbit/shared/api'
import { subscriptionKeys } from '@orbit/shared/query'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'

async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const response = await fetch(API.subscription.status)
  if (!response.ok) throw new Error(`Failed with status ${response.status}`)
  return response.json() as Promise<SubscriptionStatus>
}

export function useSubscriptionStatus() {
  const query = useQuery({
    queryKey: subscriptionKeys.status(),
    queryFn: fetchSubscriptionStatus,
    staleTime: 5 * 60 * 1000,
  })

  return { ...query, status: query.data ?? null }
}
