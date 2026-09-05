import { useEffect, useMemo } from 'react'
import { Animated, Text, View } from 'react-native'
import type { SubscriptionScreenState } from '@orbit/shared/utils'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { Icon } from '@/components/ui/icon'
import { PillButton } from '@/components/ui/pill-button'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { styles } from './styles'
import type { Tokens, UpgradeTextFn } from './types'

export function ProviderHandoff({ provider, state, onManage, t, tokens }: Readonly<{
  provider: 'stripe' | 'play'
  state: SubscriptionScreenState
  onManage: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const reducedMotion = usePrefersReducedMotion()
  const opening = state === 'portal-opening'
  const failed = state === 'portal-failed'
  const opacity = useMemo(() => new Animated.Value(1), [])
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: opening ? 0.4 : 1,
      duration: reducedMotion ? 0 : motionDurations.fast,
      easing: toAnimatedEasing(motionEasings.standard),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [opacity, opening, reducedMotion])
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.billingWell, { backgroundColor: tokens.bgWell, flexDirection: 'row' }]}>
        <Animated.View testID="billing-state-indication" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ opacity }}>
          <Icon name={provider === 'play' ? 'brand-google-play' : 'credit-card'} size={20} color={tokens.fg3} />
        </Animated.View>
        <Text style={[styles.billingSecondary, { color: tokens.fg2, flex: 1 }]}>
          {provider === 'play' ? t('upgrade.billing.actions.managePlayHint') : t('upgrade.billing.actions.manageHint')}
        </Text>
      </View>
      {failed ? (
        <View accessibilityRole="alert" style={[styles.billingWell, { backgroundColor: tokens.bgWell }]}>
          <Text style={[styles.billingBody, { color: tokens.fg1 }]}>{t('upgrade.billing.portalFailed')}</Text>
          <Text style={[styles.billingSecondary, { color: tokens.fg2 }]}>{t('upgrade.billing.portalFix')}</Text>
        </View>
      ) : null}
      <View style={{ alignItems: 'flex-start' }}>
        <PillButton variant="primary" loading={opening} disabled={state === 'offline'} onClick={onManage}>
          {failed ? t('upgrade.billing.retry') : provider === 'play' ? t('upgrade.billing.actions.managePlay') : t('upgrade.billing.actions.manage')}
        </PillButton>
      </View>
      {state === 'offline' ? <Text style={[styles.billingSecondary, { color: tokens.fg2 }]}>{t('upgrade.billing.offline')}</Text> : null}
    </View>
  )
}
