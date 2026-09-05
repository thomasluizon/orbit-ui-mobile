import { Text, View } from 'react-native'
import { subscriptionSummary } from '@orbit/shared/utils'
import type { SubscriptionPortalState } from '@orbit/shared/utils'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { Badge } from '@/components/ui/badge'
import { ProviderHandoff } from './provider-handoff'
import { PlanSummaryCard } from './plan-summary-card'
import { UsageCard } from './usage-card'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

function handoffState(isOnline: boolean, portalState: SubscriptionPortalState) {
  if (!isOnline) return 'offline'
  if (portalState === 'opening') return 'portal-opening'
  if (portalState === 'failed') return 'portal-failed'
  return 'play'
}

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
  const summary = subscriptionSummary(status, null)
  const interval = status.subscriptionInterval
  const priceLine = displayPrice
    ? interval === 'yearly'
      ? t('upgrade.billing.plan.yearlyPrice', { price: displayPrice })
      : interval === 'monthly'
        ? t('upgrade.billing.plan.monthlyPrice', { price: displayPrice })
        : null
    : null

  return (
    <View style={styles.billingStack}>
      <PlanSummaryCard
        planLabel={t(summary.nameKey)}
        body={t(summary.bodyKey, { limit: status.aiMessagesLimit })}
        badges={summary.badgeKey ? <Badge>{t(summary.badgeKey)}</Badge> : null}
        facts={[
          priceLine,
          summary.renewal
            ? t(summary.renewalKey, {
                date: formatBillingDate(summary.renewal, locale),
              })
            : null,
        ]}
        tokens={tokens}
      />
      <ProviderHandoff provider="play" state={handoffState(isOnline, portalState)} onManage={onManagePlay} t={t} tokens={tokens} />
      <UsageCard
        usagePercent={usagePercent}
        usageUrgent={usagePercent >= 80}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.actions.providerNote')}</Text>
    </View>
  )
}
