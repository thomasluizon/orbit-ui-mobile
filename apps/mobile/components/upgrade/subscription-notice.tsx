import { AstraGlyph } from '@/components/ui/astra-glyph'
import { ProBenefits } from './pro-benefits'
import { Text, View, useWindowDimensions } from 'react-native'
import { responsiveTypeStyle } from '@/lib/theme'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { PillButton } from '@/components/ui/pill-button'
import { Calendar, FileText, MessageCircle } from '@/components/ui/icons'
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
  const { width } = useWindowDimensions()
  if (!status || status.hasProAccess || (!status.lapseReason && !status.subscriptionEndedAtUtc)) return null
  const endedAt = status.subscriptionEndedAtUtc
    ? formatBillingDate(status.subscriptionEndedAtUtc, locale) : null
  const paymentFailed = status.lapseReason === 'payment_failed'
  const endedKey = paymentFailed ? 'upgrade.billing.lapsed.payment_failed' : 'upgrade.billing.lapsed.ended'
  return (
    <View style={styles.billingStack}>
      <View style={{ gap: 16, paddingVertical: 16 }}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><AstraGlyph size={96} color={tokens.fg1} /></View>
        <Text accessibilityRole="header" style={[responsiveTypeStyle('displayHeading', width), { color: tokens.fg1 }]}>{t('upgrade.billing.lapsed.title')}</Text>
        {endedAt ? <Text style={[styles.billingMeta, { color: tokens.fg3 }]}>{t(endedKey, { date: endedAt })}</Text> : null}
        {paymentFailed ? <View style={{ gap: 4 }}>
          {!endedAt ? <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.paymentIssue.title')}</Text> : null}
          <Text style={[styles.billingSecondary, { color: tokens.fg3 }]}>{t('upgrade.billing.lapsed.paymentFix')}</Text>
        </View> : null}
        <Text style={[styles.billingBody, { color: tokens.fg2 }]}>{t('upgrade.billing.lapsed.body')}</Text>
        <View style={{ gap: 8 }}>
          {[
            { label: t('upgrade.billing.lapsed.lostMessages', { limit: status.aiMessagesLimit }), Icon: MessageCircle },
            { label: t('upgrade.billing.lapsed.lostCalendar'), Icon: Calendar },
            { label: t('upgrade.billing.lapsed.lostRetrospective'), Icon: FileText },
          ].map(({ label, Icon }) => <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: 24, justifyContent: 'center' }}><Icon strokeWidth={1.5} size={16} color={tokens.fg3} /></View>
            <Text style={[styles.billingSecondary, { color: tokens.fg3, flex: 1 }]}>{label}</Text>
          </View>)}
        </View>
        {onResubscribe ? <View style={{ alignItems: 'flex-start', paddingTop: 8 }}>
          <PillButton variant="primary" onClick={onResubscribe}>{t('upgrade.billing.lapsed.action')}</PillButton>
        </View> : null}
      </View>
      <ProBenefits heading t={t} tokens={tokens} />
    </View>
  )
}
