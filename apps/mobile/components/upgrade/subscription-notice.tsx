import { Text, View } from 'react-native'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function SubscriptionNotice({
  status,
  locale,
  t,
  tokens,
}: Readonly<{
  status: SubscriptionStatus | null
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!status?.lapseReason) return null

  if (status.hasProAccess) {
    if (status.lapseReason !== 'payment_failed') return null
    return (
      <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
        <Text accessibilityRole="header" style={[styles.noticeTitle, { color: tokens.fg1 }]}>
          {t('upgrade.billing.paymentIssue.title')}
        </Text>
        <Text style={[styles.noticeBody, { color: tokens.fg3 }]}>
          {t('upgrade.billing.paymentIssue.body')}
        </Text>
      </View>
    )
  }

  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale)
    : null

  return (
    <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text accessibilityRole="header" style={[styles.noticeTitle, { color: tokens.fg1 }]}>
        {t('upgrade.billing.lapsed.title')}
      </Text>
      <Text style={[styles.noticeBody, { color: tokens.fg3 }]}>
        {endedAt
          ? t(`upgrade.billing.lapsed.${status.lapseReason}`, { date: endedAt })
          : t('upgrade.billing.lapsed.fallback')}
      </Text>
      <Text style={[styles.noticeBody, { color: tokens.fg3 }]}>
        {t('upgrade.billing.lapsed.features')}
      </Text>
      {status.subscriptionInterval === 'yearly' ? (
        <Text style={[styles.noticeBody, { color: tokens.fg3 }]}>
          {t('upgrade.billing.lapsed.yearlyFeature')}
        </Text>
      ) : null}
    </View>
  )
}
