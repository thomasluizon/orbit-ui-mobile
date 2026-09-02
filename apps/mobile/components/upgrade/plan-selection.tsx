import { Text, View } from 'react-native'
import { applySubscriptionDiscount } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice } from '@/hooks/use-subscription-plans'
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

export function PlanSelection({
  plans,
  isLoading,
  isError,
  isOnline,
  monthlyPrice,
  yearlyPrice,
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
  const checkoutPending = checkoutLoading !== null
  const intervalControl = (
    <SegmentedControl
      label={t('upgrade.plans.intervalLabel')}
      options={[
        { id: 'monthly', label: t('upgrade.plans.interval.monthly') },
        { id: 'yearly', label: t('upgrade.plans.interval.annual') },
      ]}
      value={selectedInterval}
      onChange={(interval) => {
        if (interval === 'monthly' || interval === 'yearly') onSelectInterval(interval)
      }}
      disabled={checkoutPending}
    />
  )

  if (isLoading) {
    return (
      <View accessibilityLabel={t('upgrade.plans.loading')} style={styles.planState}>
        {intervalControl}
        <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
        <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
      </View>
    )
  }

  if (isError && !plans && isOnline) {
    return (
      <View style={styles.planState}>
        {intervalControl}
        <ErrorState
          message={t('upgrade.plans.error')}
          action={<PillButton variant="ghost" onClick={onRetry}>{t('upgrade.plans.retry')}</PillButton>}
        />
      </View>
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
    couponLine,
  }
  const monthlyTier: Tier = {
    interval: 'monthly',
    name: t('upgrade.plans.monthly.name'),
    price: monthlyCharge,
    period: t('upgrade.plans.monthly.period'),
    couponLine,
  }
  const tiers = selectedInterval === 'yearly'
    ? [annualTier, monthlyTier]
    : [monthlyTier, annualTier]

  return (
    <View style={styles.planGroup}>
      {intervalControl}
      <View style={styles.planChoices}>
        {tiers.map((tier) => (
          <TierCard
            key={tier.interval}
            tier={tier}
            recommended={tier.interval === selectedInterval}
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
  )
}

function TierCard({
  tier,
  recommended,
  loading,
  disabled,
  onCheckout,
  t,
  tokens,
}: Readonly<{
  tier: Tier
  recommended: boolean
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
          backgroundColor: recommended ? tokens.primaryDim : tokens.bgCard,
          borderColor: recommended ? tokens.primary : tokens.hairline,
          borderWidth: recommended ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.tierHeader}>
        <Text accessibilityRole="header" style={[styles.tierName, { color: tokens.fg1 }]}>{tier.name}</Text>
        {recommended ? <Badge>{t('upgrade.plans.recommended')}</Badge> : null}
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
