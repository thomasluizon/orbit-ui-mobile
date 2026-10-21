'use client'

import { useTranslations } from 'next-intl'
import { selectReferralReward } from '@orbit/shared/utils'
import { useReferral } from '@/hooks/use-referral'

export function useReferralInvitation() {
  const t = useTranslations()
  const { stats, isError } = useReferral()
  const reward = selectReferralReward(isError ? null : stats)
  return t(`referral.share.${reward.kind}`, reward.values)
}
