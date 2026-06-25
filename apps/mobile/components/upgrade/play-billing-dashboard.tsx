import { Settings } from 'lucide-react-native'
import { Text, View } from 'react-native'
import { PillButton } from '@/components/ui/pill-button'
import { PlanSummaryCard } from './plan-summary-card'
import { UsageCard } from './usage-card'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function PlayBillingDashboard({
  profile,
  locale,
  usagePercent,
  usageProfile,
  portalError,
  onManagePlay,
  t,
  tokens,
}: Readonly<{
  profile: {
    subscriptionInterval?: string | null
    planExpiresAt?: string | null
  } | null
  locale: string
  usagePercent: number
  usageProfile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  portalError: string
  onManagePlay: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <>
      <PlanSummaryCard
        planLabel={
          profile?.subscriptionInterval === 'yearly'
            ? t('upgrade.billing.plan.yearly')
            : t('upgrade.billing.plan.monthly')
        }
        meta={
          profile?.planExpiresAt
            ? t('upgrade.billing.plan.renewsOn', {
                date: formatBillingDate(profile.planExpiresAt, locale),
              })
            : undefined
        }
        t={t}
        tokens={tokens}
      />
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent > 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      <View style={styles.actionPad}>
        <PillButton
          variant="white"
          fullWidth
          onPress={onManagePlay}
          leading={<Settings size={18} strokeWidth={1.8} color={tokens.bg} />}
        >
          {t('upgrade.billing.actions.managePlay')}
        </PillButton>
        <Text style={[styles.centerMuted, { color: tokens.fg3 }]}>
          {t('upgrade.billing.actions.managePlayHint')}
        </Text>
        {portalError ? (
          <Text style={[styles.errorText, { color: tokens.statusBad }]}>
            {portalError}
          </Text>
        ) : null}
      </View>
    </>
  )
}
