import { Text, View } from 'react-native'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { Icon } from '@/components/ui/icon'
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
  const paymentFailed = status.lapseReason === 'payment_failed'
  const endedKey = paymentFailed ? 'upgrade.billing.lapsed.payment_failed' : 'upgrade.billing.lapsed.ended'
  const usagePercent = status.aiMessagesLimit > 0 ? Math.min(100, status.aiMessagesUsed / status.aiMessagesLimit * 100) : 0
  return (
    <View style={styles.billingStack}>
      <View style={[styles.billingCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
        <Text accessibilityRole="header" style={[styles.lapsedHeading, { color: tokens.fg1 }]}>{t('upgrade.billing.lapsed.title')}</Text>
        {endedAt ? <Text style={[styles.billingMeta, { color: tokens.fg3 }]}>{t(endedKey, { date: endedAt })}</Text> : null}
        {paymentFailed ? <View style={{ gap: 4 }}>
          {!endedAt ? <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.paymentIssue.title')}</Text> : null}
          <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.lapsed.paymentFix')}</Text>
        </View> : null}
        <Text style={[styles.billingBody, { color: tokens.fg2 }]}>{t('upgrade.billing.lapsed.body')}</Text>
        <View style={{ gap: 8 }}>
          {[
            t('upgrade.billing.lapsed.lostMessages', { limit: status.aiMessagesLimit }),
            t('upgrade.billing.lapsed.lostCalendar'),
            t('upgrade.billing.lapsed.lostRetrospective'),
          ].map((label) => <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 24, justifyContent: 'center' }}><Icon name="minus" size={16} color={tokens.fg3} /></View>
            <Text style={[styles.billingSecondary, { color: tokens.fg3, flex: 1 }]}>{label}</Text>
          </View>)}
        </View>
        {onResubscribe ? <View style={{ alignItems: 'flex-start', paddingTop: 8 }}><PillButton variant="primary" onClick={onResubscribe}>{t('upgrade.billing.lapsed.action')}</PillButton></View> : null}
      </View>
      <UsageCard usagePercent={usagePercent} usageUrgent={usagePercent >= 80} profile={status} t={t} tokens={tokens} />
    </View>
  )
}
