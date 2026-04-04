'use client'

import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { subscriptionKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function formatPrice(unitAmount: number, currency: string): string {
  const amount = unitAmount / 100
  const locale = currency === 'brl' ? 'pt-BR' : 'en-US'
  const currencyCode = currency.toUpperCase()
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function monthlyEquivalent(yearlyUnitAmount: number): number {
  return Math.round(yearlyUnitAmount / 12)
}

export function useSubscriptionPlans() {
  const query = useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: () => fetchJson<SubscriptionPlans>(API.subscription.plans),
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
  })

  const plans = query.data ?? null

  const discountedAmount = useCallback(
    (unitAmount: number): number => {
      if (!plans?.couponPercentOff) return unitAmount
      return Math.round(unitAmount * (1 - plans.couponPercentOff / 100))
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
