import { useTranslation } from 'react-i18next'
import { UserPlus } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { useReferral } from '@/hooks/use-referral'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ReferralCardProps {
  onOpen: () => void
  onDismiss?: () => void
}

/** A quiet referral entry that follows the shared list-row contract. */
export function ReferralCard({ onOpen, onDismiss }: Readonly<ReferralCardProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { stats, isLoading } = useReferral()

  const description = !isLoading && stats
    ? t('referral.card.progress', {
        count: stats.successfulReferrals,
        max: stats.maxReferrals,
      })
    : t('referral.card.hint')

  return (
    <ListRow
      icon={<UserPlus size={24} strokeWidth={1.8} color={tokens.fg2} />}
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
