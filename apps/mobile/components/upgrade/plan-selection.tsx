import { useEffect, useRef, type ReactNode } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { applySubscriptionDiscount } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { styles } from './styles'
import {
  monthlyEquivalentPriceLabel,
  type SubscriptionInterval,
  type Tokens,
  type UpgradeTextFn,
} from './types'

interface Tier {
  interval: SubscriptionInterval
  name: string
  price: string
  period: string
  heroLine?: string
  secondLine?: string
  couponLine?: string
}

const motionPurpose = {
  interval: 'state indication',
  recommendation: 'state indication',
  tier: 'spatial consistency',
  load: 'preventing a jarring change',
} as const

function motionTestId(purpose: string, suffix?: string) {
  return `upgrade-motion-${purpose.replaceAll(' ', '-')}${suffix ? `-${suffix}` : ''}`
}

function PlanLoadMotion({
  stateKey,
  reduced,
  children,
}: Readonly<{ stateKey: string; reduced: boolean; children: ReactNode }>) {
  const previousStateKey = useRef(stateKey)
  const opacity = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  useEffect(() => {
    const shouldEnter = previousStateKey.current === 'loading' && stateKey !== 'loading'
    previousStateKey.current = stateKey
    if (reduced || !shouldEnter) {
      opacity.value = 1
      return
    }

    opacity.value = 0
    opacity.value = withTiming(1, {
      duration: motionDurations.base,
      easing: toAnimatedEasing(motionEasings.enter),
      reduceMotion: ReduceMotion.System,
    })
  }, [opacity, reduced, stateKey])

  return (
    <Animated.View
      style={animatedStyle}
      testID={motionTestId(motionPurpose.load)}
    >
      {children}
    </Animated.View>
  )
}

export function PlanSelection({
  plans,
  isLoading,
  isError,
  isOnline,
  monthlyPrice,
  yearlyPrice,
  monthlyOffer,
  yearlyOffer,
  selectedInterval,
  checkoutLoading,
  checkoutError,
  checkoutDisabled,
  onSelectInterval,
  onCheckout,
  onRetry,
  t,
  tokens,
}: Readonly<{
  plans: SubscriptionPlans | null | undefined
  isLoading: boolean
  isError: boolean
  isOnline: boolean
  monthlyOffer: PlayOffer | null
  yearlyOffer: PlayOffer | null
  monthlyPrice?: string
  yearlyPrice?: string
  selectedInterval: SubscriptionInterval
  checkoutLoading: SubscriptionInterval | null
  checkoutError: string
  checkoutDisabled: boolean
  onSelectInterval: (interval: SubscriptionInterval) => void
  onCheckout: (interval: SubscriptionInterval) => void
  onRetry: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const intervalPulse = useSharedValue(1)
  const recommendationPulse = useSharedValue(1)
  const checkoutPending = checkoutLoading !== null
  const intervalMotionStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + (intervalPulse.value * 0.28),
    transform: [{ scale: 0.98 + (intervalPulse.value * 0.02) }],
  }))
  const recommendationMotionStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + (recommendationPulse.value * 0.42),
    transform: [{ scale: 0.97 + (recommendationPulse.value * 0.03) }],
  }))
  const tierLayoutTransition = prefersReducedMotion
    ? undefined
    : LinearTransition.duration(motionDurations.base)
        .easing(toAnimatedEasing(motionEasings.standard))
        .reduceMotion(ReduceMotion.System)

  const selectInterval = (interval: string) => {
    if (interval !== 'monthly' && interval !== 'yearly') return
    onSelectInterval(interval)
    if (prefersReducedMotion) return

    intervalPulse.value = 0
    intervalPulse.value = withTiming(1, {
      duration: motionDurations.fast,
      easing: toAnimatedEasing(motionEasings.standard),
      reduceMotion: ReduceMotion.System,
    })
    recommendationPulse.value = 0
    recommendationPulse.value = withTiming(1, {
      duration: motionDurations.fast,
      easing: toAnimatedEasing(motionEasings.standard),
      reduceMotion: ReduceMotion.System,
    })
  }

  const intervalControl = (
    <Animated.View
      style={intervalMotionStyle}
      testID={motionTestId(motionPurpose.interval)}
    >
      <SegmentedControl
        label={t('upgrade.plans.intervalLabel')}
        options={[
          { id: 'monthly', label: t('upgrade.plans.interval.monthly') },
          { id: 'yearly', label: t('upgrade.plans.interval.annual') },
        ]}
        value={selectedInterval}
        onChange={selectInterval}
        disabled={checkoutPending}
      />
    </Animated.View>
  )

  if (isLoading) {
    return (
      <PlanLoadMotion stateKey="loading" reduced={prefersReducedMotion}>
        <View accessibilityLabel={t('upgrade.plans.loading')} style={styles.planState}>
          {intervalControl}
          <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
          <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
        </View>
      </PlanLoadMotion>
    )
  }

  if (isError && !plans && isOnline) {
    return (
      <PlanLoadMotion stateKey="error" reduced={prefersReducedMotion}>
        <View style={styles.planState}>
          {intervalControl}
          <ErrorState
            message={t('upgrade.plans.error')}
            action={<PillButton variant="ghost" onClick={onRetry}>{t('upgrade.plans.retry')}</PillButton>}
          />
        </View>
      </PlanLoadMotion>
    )
  }

  if (!plans) return null

  const monthlyCharge = monthlyPrice ?? formatPrice(
    applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff),
    plans.currency,
  )
  const yearlyCharge = yearlyPrice ?? formatPrice(
    applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff),
    plans.currency,
  )
  const couponLine = plans.couponPercentOff
    ? t('upgrade.plans.coupon.line', { percent: plans.couponPercentOff })
    : undefined
  const annualTier: Tier = {
    interval: 'yearly',
    name: t('upgrade.plans.yearly.name'),
    price: yearlyCharge,
    period: t('upgrade.plans.yearly.period'),
    heroLine: t('upgrade.plans.yearly.heroLine'),
    secondLine: t('upgrade.plans.yearly.equivalent', {
      price: monthlyEquivalentPriceLabel(plans, yearlyOffer),
      percent: plans.savingsPercent,
    }),
    couponLine: yearlyOffer?.isReferral ? couponLine : undefined,
  }
  const monthlyTier: Tier = {
    interval: 'monthly',
    name: t('upgrade.plans.monthly.name'),
    price: monthlyCharge,
    period: t('upgrade.plans.monthly.period'),
    couponLine: monthlyOffer?.isReferral ? couponLine : undefined,
  }
  const tiers = selectedInterval === 'yearly'
    ? [annualTier, monthlyTier]
    : [monthlyTier, annualTier]

  return (
    <PlanLoadMotion stateKey="loaded" reduced={prefersReducedMotion}>
      <View style={styles.planGroup}>
        {intervalControl}
        <View style={styles.planChoices}>
          {tiers.map((tier) => (
            <Animated.View
              key={tier.interval}
              layout={tierLayoutTransition}
              testID={`upgrade-motion-tier-${motionPurpose.tier.replaceAll(' ', '-')}-${tier.interval}`}
            >
              <TierCard
                tier={tier}
                recommended={tier.interval === 'yearly'}
                loading={checkoutLoading === tier.interval}
                disabled={checkoutPending || checkoutDisabled}
                recommendationMotionStyle={recommendationMotionStyle}
                onCheckout={onCheckout}
                t={t}
                tokens={tokens}
              />
            </Animated.View>
          ))}
        </View>
        {checkoutError ? (
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            style={[styles.errorText, { color: tokens.statusBad }]}
          >
            {checkoutError}
          </Text>
        ) : null}
      </View>
    </PlanLoadMotion>
  )
}

function TierCard({
  tier,
  recommended,
  loading,
  disabled,
  recommendationMotionStyle,
  onCheckout,
  t,
  tokens,
}: Readonly<{
  tier: Tier
  recommended: boolean
  loading: boolean
  disabled: boolean
  recommendationMotionStyle: StyleProp<AnimatedStyle<ViewStyle>>
  onCheckout: (interval: SubscriptionInterval) => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  return (
    <View
      testID={`upgrade-tier-${tier.interval}`}
      style={[
        styles.tierCard,
        {
          backgroundColor: recommended ? tokens.primaryDim : tokens.bgCard,
          borderColor: recommended ? tokens.primary : tokens.hairline,
          borderWidth: recommended ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.tierHeader}>
        <Text accessibilityRole="header" style={[styles.tierName, { color: tokens.fg1 }]}>{tier.name}</Text>
        {recommended ? (
          <Animated.View
            style={recommendationMotionStyle}
            testID={motionTestId(motionPurpose.recommendation)}
          >
            <Badge>{t('upgrade.plans.recommended')}</Badge>
          </Animated.View>
        ) : null}
      </View>
      <Text style={[styles.tierPrice, { color: tokens.fg1 }]}>
        {tier.price}<Text style={[styles.tierPeriod, { color: tokens.fg3 }]}>{tier.period}</Text>
      </Text>
      {tier.heroLine ? <Text style={[styles.tierHero, { color: tokens.fg2 }]}>{tier.heroLine}</Text> : null}
      {tier.secondLine ? <Text style={[styles.tierSecond, { color: tokens.fg3 }]}>{tier.secondLine}</Text> : null}
      {tier.couponLine ? <Text style={[styles.tierCoupon, { color: tokens.fg2 }]}>{tier.couponLine}</Text> : null}
      <View style={styles.tierAction}>
        <PillButton
          variant={recommended ? 'primary' : 'ghost'}
          loading={loading}
          disabled={disabled}
          accessibleName={t('upgrade.plans.checkoutLabel', { interval: tier.name })}
          onClick={() => onCheckout(tier.interval)}
        >
          {t('upgrade.plans.cta')}
        </PillButton>
      </View>
    </View>
  )
}
