import { ProBenefits } from './pro-benefits'
import { Platform, Text, View } from 'react-native'
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
  provider = 'play',
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
  provider?: 'stripe' | 'play' | 'app_store' | null
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
  const canManage = !status.isLifetimePro && (Platform.OS === 'ios' ? provider === 'app_store' : provider === 'play')
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
      <StoreManagement canManage={canManage} provider={provider} lifetime={status.isLifetimePro} isOnline={isOnline} portalState={portalState} onManage={onManagePlay} t={t} tokens={tokens} />
      <ProBenefits heading t={t} tokens={tokens} />
      <UsageCard
        usagePercent={usagePercent}
        profile={usageProfile}
        t={t}
        tokens={tokens}
      />
      {canManage ? <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.actions.providerNote')}</Text> : null}
    </View>
  )
}

function StoreManagement({ canManage, provider, lifetime, isOnline, portalState, onManage, t, tokens }: Readonly<{
  canManage: boolean; provider: 'stripe' | 'play' | 'app_store' | null; lifetime: boolean
  isOnline: boolean; portalState: SubscriptionPortalState; onManage: () => void; t: UpgradeTextFn; tokens: Tokens
}>) {
  if (canManage) return <ProviderHandoff provider={provider === 'app_store' ? 'app_store' : 'play'} state={handoffState(isOnline, portalState)} onManage={onManage} t={t} tokens={tokens} />
  if (provider === 'app_store' && !lifetime) return <Text style={[styles.billingSecondary, { color: tokens.fg2 }]}>{t('upgrade.appStore.manageOnIphone')}</Text>
  return null
}
