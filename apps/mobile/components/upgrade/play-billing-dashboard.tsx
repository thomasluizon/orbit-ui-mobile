import { Text, View } from 'react-native'
import type { SubscriptionPortalState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { PlanSummaryCard } from './plan-summary-card'
import { PitchSubscriptionCard } from './pitch-subscription-card'
import { UsageCard } from './usage-card'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function PlayBillingDashboard({
  status,
  displayPrice,
  locale,
  usagePercent,
  usageProfile,
  portalState,
  isOnline,
  onManagePlay,
  t,
  tokens,
}: Readonly<{
  status: SubscriptionStatus | null
  displayPrice?: string
  locale: string
  usagePercent: number
  usageProfile: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  portalState: SubscriptionPortalState
  isOnline: boolean
  onManagePlay: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!status) return null
  const interval = status.subscriptionInterval
  const priceLine = displayPrice
    ? interval === 'yearly'
      ? t('upgrade.billing.plan.yearlyPrice', { price: displayPrice })
      : interval === 'monthly'
        ? t('upgrade.billing.plan.monthlyPrice', { price: displayPrice })
        : null
    : null

  return (
    <>
      <PitchSubscriptionCard status={status} locale={locale} t={t} tokens={tokens} />
      <PlanSummaryCard
        planLabel={
          interval === 'yearly'
            ? t('upgrade.billing.plan.yearly')
            : interval === 'monthly'
              ? t('upgrade.billing.plan.monthly')
              : t('upgrade.billing.plan.pro')
        }
        meta={[
          priceLine,
          status.planExpiresAt
            ? t('upgrade.billing.plan.renewsOn', {
                date: formatBillingDate(status.planExpiresAt, locale),
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        t={t}
        tokens={tokens}
      />
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent >= 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      <View style={styles.actionPad}>
        {portalState === 'failed' ? (
          <>
            <Text accessibilityRole="alert" style={[styles.centerMuted, { color: tokens.fg2 }]}>
              {t('upgrade.billing.portalFailed')}
            </Text>
            <PillButton variant="ghost" onClick={onManagePlay}>
              {t('upgrade.billing.retry')}
            </PillButton>
          </>
        ) : (
          <PillButton variant="primary" loading={portalState === 'opening'} disabled={!isOnline} onClick={onManagePlay}>
            {portalState === 'opening'
              ? t('upgrade.billing.actions.opening')
              : t('upgrade.billing.actions.managePlay')}
          </PillButton>
        )}
        <Text style={[styles.centerMuted, { color: tokens.fg3 }]}>
          {t('upgrade.billing.actions.managePlayHint')}
        </Text>
      </View>
    </>
  )
}
