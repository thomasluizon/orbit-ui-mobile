import { useState, type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
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
import { usePrefersReducedMotion } from '@/lib/motion'
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
  load: 'preventing a jarring change',
} as const

function motionTestId(purpose: string) {
  return `upgrade-motion-${purpose.replaceAll(' ', '-')}`
}

function PlanLoadMotion({
  stateKey,
  reduced,
  children,
}: Readonly<{ stateKey: string; reduced: boolean; children: ReactNode }>) {
  const [transition, setTransition] = useState({ stateKey, shouldEnter: false })
  if (transition.stateKey !== stateKey) {
    setTransition({
      stateKey,
      shouldEnter: true,
    })
  }

  return (
    <Animated.View
      key={stateKey}
      entering={transition.shouldEnter && !reduced
        ? FadeIn.duration(motionDurations.base)
            .easing(Easing.bezier(...motionEasings.enter))
            .reduceMotion(ReduceMotion.System)
        : undefined}
      exiting={!reduced
        ? FadeOut.duration(motionDurations.routeExit)
            .easing(Easing.bezier(...motionEasings.exit))
            .reduceMotion(ReduceMotion.System)
        : undefined}
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
  const checkoutPending = checkoutLoading !== null
  const selectInterval = (interval: string) => {
    if (interval !== 'monthly' && interval !== 'yearly') return
    onSelectInterval(interval)
  }

  const intervalControl = (
    <View>
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
    </View>
  )

  if (isLoading) {
    return (
      <PlanLoadMotion stateKey="loading" reduced={prefersReducedMotion}>
        <View accessibilityLabel={t('upgrade.plans.loading')} style={styles.planState}>
          {intervalControl}
          {[0, 1].map((tierIndex) => (
            <View key={tierIndex} style={styles.planChoices}>
              {[0, 1, 2].map((rowIndex) => (
                <Skeleton
                  key={rowIndex}
                  variant="settings"
                  label={t('upgrade.plans.loading')}
                />
              ))}
            </View>
          ))}
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
            <TierCard
              key={tier.interval}
              tier={tier}
              recommended={tier.interval === 'yearly'}
              selected={tier.interval === selectedInterval}
              loading={checkoutLoading === tier.interval}
              disabled={checkoutPending || checkoutDisabled}
              onCheckout={onCheckout}
              t={t}
              tokens={tokens}
            />
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
  selected,
  loading,
  disabled,
  onCheckout,
  t,
  tokens,
}: Readonly<{
  tier: Tier
  recommended: boolean
  selected: boolean
  loading: boolean
  disabled: boolean
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
          backgroundColor: selected ? tokens.primaryDim : tokens.bgCard,
          borderColor: selected ? tokens.primary : tokens.hairline,
          borderWidth: selected ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.tierHeader}>
        <Text accessibilityRole="header" style={[styles.tierName, { color: tokens.fg1 }]}>{tier.name}</Text>
        {recommended ? (
          <Badge>{t('upgrade.plans.recommended')}</Badge>
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
          variant={selected ? 'primary' : 'ghost'}
          loading={loading}
          disabled={disabled}
          accessibleName={t(recommended ? 'upgrade.plans.checkoutLabelRecommended' : 'upgrade.plans.checkoutLabel', { interval: tier.name })}
          onClick={() => onCheckout(tier.interval)}
        >
          {t('upgrade.plans.cta')}
        </PillButton>
      </View>
    </View>
  )
}
