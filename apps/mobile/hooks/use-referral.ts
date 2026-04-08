import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { referralKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { ReferralDashboard } from '@orbit/shared/types/referral'
import { buildReferralUrl } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'

export function useReferral() {
  const query = useQuery({
    queryKey: referralKeys.all,
    queryFn: () => apiClient<ReferralDashboard>(API.referral.dashboard),
    staleTime: QUERY_STALE_TIMES.subscriptionPlans,
  })

  const code = query.data?.code ?? null
  const stats = query.data?.stats ?? null

  const referralUrl = useMemo(() => buildReferralUrl(code), [code])

  return {
    ...query,
    code,
    stats,
    referralUrl,
  }
}
