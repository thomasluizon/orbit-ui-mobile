'use client'

import { useTranslations } from 'next-intl'
import { REFERRAL_REWARD_COPY_KEYS, selectReferralReward } from '@orbit/shared/utils'
import { useReferral } from '@/hooks/use-referral'

export function useReferralInvitation() {
  const t = useTranslations()
  const { stats, isError } = useReferral()
  const reward = selectReferralReward(isError ? null : stats)
  return t(REFERRAL_REWARD_COPY_KEYS[reward.kind].shareKey, reward.values)
}
