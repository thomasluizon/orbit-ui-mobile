'use client'

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { referralKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import { buildReferralUrl } from '@orbit/shared/utils'
import { fetchJson } from '@/lib/api-fetch'

export function useReferral() {
  const query = useQuery({
    queryKey: referralKeys.all,
    queryFn: () => fetchJson<ReferralDashboard>(API.referral.dashboard),
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
  })

  const code = query.data?.code ?? null
  const stats = query.data?.stats ?? null

  // react-doctor-disable-next-line exhaustive-deps -- code aliases query.data.code and is already in deps; react-doctor does not resolve the alias; https://github.com/thomasluizon/orbit-ui-mobile/issues/243
  const referralUrl = useMemo(() => buildReferralUrl(code), [code])

  return {
    ...query,
    code,
    stats,
    referralUrl,
  }
}
