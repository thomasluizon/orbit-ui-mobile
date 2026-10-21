import { useTranslation } from 'react-i18next'
import { selectReferralReward } from '@orbit/shared/utils'
import { useReferral } from '@/hooks/use-referral'

export function useReferralInvitation() {
  const { t } = useTranslation()
  const { stats, isError } = useReferral()
  const reward = selectReferralReward(isError ? null : stats)
  return t(`referral.share.${reward.kind}`, reward.values)
}
