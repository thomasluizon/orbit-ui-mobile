import { ActivityIndicator, Text, View } from 'react-native'
import { Sparkles } from 'lucide-react-native'
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
        disabled={disabled || checkoutLoading !== null}
        onPress={() => onCheckout(selectedInterval)}
        leading={
          checkoutLoading ? (
            <ActivityIndicator size="small" color={tokens.fgOnPrimary} />
          ) : (
            <Sparkles size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />
          )
        }
      >
        {ctaLabel}
      </PillButton>
      <Text style={[styles.footerTerms, { color: tokens.fg3 }]}>{t('upgrade.convert.noCardCancel')}</Text>
    </View>
  )
}
