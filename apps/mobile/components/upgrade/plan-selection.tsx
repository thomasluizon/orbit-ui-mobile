import { Pressable, Text, View } from 'react-native'
import { applySubscriptionDiscount } from '@orbit/shared/utils'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { PlanCard } from '@/components/upgrade/plan-card'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl } from '@/components/ui/segmented-control'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

export function PlanSelection({
  plans,
  isLoading,
  isError,
  isOnline,
  monthlyPrice,
  yearlyPrice,
  selectedInterval,
  onSelectInterval,
  onStayFree,
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
  onSelectInterval: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  onRetry: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  if (isLoading) {
    return (
      <View accessibilityLabel={t('upgrade.plans.loading')} style={styles.planState}>
        <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
        <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
      </View>
    )
  }

  if (isError && !plans && isOnline) {
    return (
      <View style={styles.planState}>
        <ErrorState
          message={t('upgrade.plans.error')}
          action={<PillButton variant="ghost" onClick={onRetry}>{t('upgrade.plans.retry')}</PillButton>}
        />
      </View>
    )
  }

  if (!plans) return null

  const monthlyCharge =
    monthlyPrice ??
    formatPrice(applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff), plans.currency)

  return (
    <View style={styles.planGroup}>
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
      />
      <View accessibilityRole="radiogroup" accessibilityLabel={t('upgrade.plan')} style={styles.planChoices}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={<Badge>{t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}</Badge>}
        price={yearlyPrice ?? formatPrice(
          applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff),
          plans.currency,
        )}
        selected={selectedInterval === 'yearly'}
        onClick={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${monthlyCharge}${t('upgrade.plans.monthly.period')}`}
        selected={selectedInterval === 'monthly'}
        onClick={() => onSelectInterval('monthly')}
      />
      <Pressable
        accessibilityRole="button"
        onPress={onStayFree}
        style={({ pressed }) => [
          styles.freeLink,
          pressed ? { opacity: 0.7, transform: [{ scale: 0.96 }] } : null,
        ]}
      >
        <Text style={[styles.freeLinkText, { color: tokens.fg3 }]}>{t('upgrade.convert.stayFree')}</Text>
      </Pressable>
      </View>
    </View>
  )
}
