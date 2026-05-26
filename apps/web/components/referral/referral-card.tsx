'use client'

import { useTranslations } from 'next-intl'
import { useReferral } from '@/hooks/use-referral'
import { SettingsRow } from '@/components/ui/settings-row'

interface ReferralCardProps {
  onOpen: () => void
}

/** v8 chrome: flush SettingsRow with title left, mono progress value right. */
export function ReferralCard({ onOpen }: Readonly<ReferralCardProps>) {
  const t = useTranslations()
  const { stats, isLoading } = useReferral()

  let value = t('referral.card.hint')
  if (!isLoading && stats) {
    value = t('referral.card.progress', {
      count: stats.successfulReferrals,
      max: stats.maxReferrals,
    })
  }

  return (
    <SettingsRow
      label={t('referral.card.title')}
      onClick={onOpen}
      value={value}
      mono={!isLoading && !!stats}
    />
  )
}
