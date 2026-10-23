import { useTranslation } from 'react-i18next'
import { REFERRAL_REWARD_COPY_KEYS, selectReferralReward } from '@orbit/shared/utils'
import { useReferral } from '@/hooks/use-referral'

export function useReferralInvitation() {
  const { t } = useTranslation()
  const { stats, isError } = useReferral()
  const reward = selectReferralReward(isError ? null : stats)
  return t(REFERRAL_REWARD_COPY_KEYS[reward.kind].shareKey, reward.values)
}
