import { Text, View } from 'react-native'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { UsageCard } from './usage-card'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function SubscriptionNotice({ status, locale, onResubscribe, t, tokens }: Readonly<{
  status: SubscriptionStatus | null
  locale: string
  onResubscribe?: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!status || status.hasProAccess || (!status.lapseReason && !status.subscriptionEndedAtUtc)) return null
  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale) : null
  const usagePercent = status.aiMessagesLimit > 0 ? Math.min(100, status.aiMessagesUsed / status.aiMessagesLimit * 100) : 0
  return (
    <View style={styles.billingStack}>
      <View style={[styles.billingCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
        <Text accessibilityRole="header" style={[styles.billingHeading, { color: tokens.fg1 }]}>{t('upgrade.billing.lapsed.title')}</Text>
        {endedAt ? <Text style={[styles.billingMeta, { color: tokens.fg3 }]}>{t('upgrade.billing.lapsed.ended', { date: endedAt })}</Text> : null}
        <Text style={[styles.billingBody, { color: tokens.fg2 }]}>{t('upgrade.billing.lapsed.body')}</Text>
        <View style={{ gap: 4 }}>
          <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.lapsed.features')}</Text>
        </View>
        {onResubscribe ? <View style={{ alignItems: 'flex-start', paddingTop: 8 }}><PillButton variant="primary" onClick={onResubscribe}>{t('upgrade.billing.lapsed.action')}</PillButton></View> : null}
      </View>
      <UsageCard usagePercent={usagePercent} usageUrgent={usagePercent >= 80} profile={status} t={t} tokens={tokens} />
    </View>
  )
}
