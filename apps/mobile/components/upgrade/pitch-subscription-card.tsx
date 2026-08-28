import { Text, View } from 'react-native'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { Badge } from '@/components/ui/badge'
import { formatBillingDate } from './types'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function PitchSubscriptionCard({
  status,
  locale,
  t,
  tokens,
}: Readonly<{
  status: SubscriptionStatus
  locale: string
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (!status.isTrialActive && !status.lapseReason) return null
  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale)
    : null

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.bgCard,
          borderColor: tokens.hairline,
          padding: 24,
        },
      ]}
    >
      <Text style={[styles.cardLabel, { color: tokens.fg3 }]}>
        {t('upgrade.billing.plan.title')}
      </Text>
      <View style={styles.cardValueRow}>
        <Text style={[styles.cardValue, { color: tokens.fg1 }]}>
          {status.subscriptionInterval === 'yearly'
            ? t('upgrade.billing.plan.yearly')
            : t('upgrade.billing.plan.monthly')}
        </Text>
        {status.isTrialActive ? <Badge>{t('upgrade.billing.plan.trialBadge')}</Badge> : null}
      </View>
      {status.isTrialActive && status.trialEndsAt ? (
        <Text style={[styles.cardMeta, { color: tokens.fg3 }]}>
          {t('upgrade.billing.plan.trialHint', {
            date: formatBillingDate(status.trialEndsAt, locale),
          })}
        </Text>
      ) : null}
      {status.lapseReason ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <Text style={[styles.noticeText, { color: tokens.fg1, textAlign: 'left' }]}>
            {t('upgrade.billing.lapsed.title')}
          </Text>
          <Text style={[styles.centerMuted, { color: tokens.fg3, textAlign: 'left' }]}>
            {endedAt
              ? t(`upgrade.billing.lapsed.${status.lapseReason}`, {
                  date: endedAt,
                })
              : t('upgrade.billing.lapsed.fallback')}
          </Text>
          <Text style={[styles.centerMuted, { color: tokens.fg3, textAlign: 'left' }]}>
            {t('upgrade.billing.lapsed.features')}
          </Text>
          {status.subscriptionInterval === 'yearly' ? (
            <Text style={[styles.centerMuted, { color: tokens.fg3, textAlign: 'left' }]}>
              {t('upgrade.billing.lapsed.yearlyFeature')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}
