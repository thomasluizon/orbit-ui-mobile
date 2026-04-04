'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { referralKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ReferralDashboard } from '@orbit/shared/types/referral'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? body?.message ?? `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function useReferral() {
  const query = useQuery({
    queryKey: referralKeys.all,
    queryFn: () => fetchJson<ReferralDashboard>(API.referral.dashboard),
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
  })

  const code = query.data?.code ?? null
  const stats = query.data?.stats ?? null

  const referralUrl = useMemo(() => {
    if (!code) return ''
    return `https://app.useorbit.org/r/${code}`
  }, [code])

  return {
    ...query,
    code,
    stats,
    referralUrl,
  }
}
