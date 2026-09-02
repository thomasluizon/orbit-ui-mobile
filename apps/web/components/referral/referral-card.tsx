'use client'

import { useTranslations } from 'next-intl'
import { UserPlus } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { useReferral } from '@/hooks/use-referral'

interface ReferralCardProps {
  onOpen: () => void
  onDismiss?: () => void
}

/** A quiet referral entry that follows the shared list-row contract. */
export function ReferralCard({ onOpen, onDismiss }: Readonly<ReferralCardProps>) {
  const t = useTranslations()
  const { stats, isLoading } = useReferral()

  const description = !isLoading && stats
    ? t('referral.card.progress', {
        count: stats.successfulReferrals,
        max: stats.maxReferrals,
      })
    : t('referral.card.hint')

  return (
    <ListRow
      icon={<UserPlus size={24} strokeWidth={1.8} color="var(--fg-2)" />}
      title={t('referral.card.title')}
      description={description}
      onClick={onOpen}
      chevron={!onDismiss}
      action={onDismiss ? {
        icon: 'x',
        label: t('common.dismiss'),
        onPress: onDismiss,
      } : undefined}
    />
  )
}
