import { Text, View } from 'react-native'
import { PillButton } from '@/components/ui/pill-button'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

export function PricingFooter({
  trialActive,
  selectedInterval,
  priceEcho,
  checkoutLoading,
  checkoutError,
  disabled,
  onCheckout,
  t,
  tokens,
}: Readonly<{
  trialActive: boolean
  selectedInterval: SubscriptionInterval
  priceEcho: string
  checkoutLoading: SubscriptionInterval | null
  checkoutError: string
  disabled: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const ctaLabel = trialActive ? t('upgrade.convert.trialCta') : t('upgrade.convert.freeCta')

  return (
    <View style={[styles.footerBar, { borderTopColor: tokens.hairline, backgroundColor: tokens.bg }]}>
      {checkoutError ? (
        <Text style={[styles.footerError, { color: tokens.statusBad }]}>{checkoutError}</Text>
      ) : (
        <Text style={[styles.footerEcho, { color: tokens.fg3 }]}>{priceEcho}</Text>
      )}
      <PillButton
        fullWidth
        busy={checkoutLoading !== null}
        disabled={disabled || checkoutLoading !== null}
        onPress={() => onCheckout(selectedInterval)}
      >
        {ctaLabel}
      </PillButton>
      <Text style={[styles.footerTerms, { color: tokens.fg3 }]}>{t('upgrade.convert.cancelAnytime')}</Text>
      <Text style={[styles.renewalNote, { color: tokens.fg3 }]}>{t('upgrade.plans.renewalNote')}</Text>
    </View>
  )
}
