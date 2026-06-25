import { View } from 'react-native'
import { applySubscriptionDiscount } from '@orbit/shared/utils'
import {
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
} from '@orbit/shared/utils/upgrade'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { PlanCard } from '@/components/upgrade/plan-card'
import type { PlayOffer } from '@/hooks/use-play-billing'
import { formatPrice } from '@/hooks/use-subscription-plans'
import { styles } from './styles'
import { monthlyEquivalentPriceLabel } from './types'
import type { SubscriptionInterval, UpgradeTextFn } from './types'

export function PlanSelection({
  plans,
  yearlyOffer,
  monthlyPrice,
  yearlyPrice,
  selectedInterval,
  onSelectInterval,
  t,
}: Readonly<{
  plans: SubscriptionPlans
  yearlyOffer: PlayOffer | null
  monthlyPrice?: string
  yearlyPrice?: string
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  t: UpgradeTextFn
}>) {
  const yearlyCharge = yearlyPrice
    ?? formatPrice(applySubscriptionDiscount(plans.yearly.unitAmount, plans.couponPercentOff), plans.currency)
  const monthlyCharge = monthlyPrice
    ?? formatPrice(applySubscriptionDiscount(plans.monthly.unitAmount, plans.couponPercentOff), plans.currency)
  const discountSuffix = !yearlyPrice && plans.couponPercentOff
    ? ` · ${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
    : ''

  return (
    <View accessibilityRole="radiogroup" style={styles.planGroup}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        price={t('upgrade.plans.equivalent', {
          price: monthlyEquivalentPriceLabel(plans, yearlyOffer),
        })}
        sub={`${yearlyCharge}${t('upgrade.plans.yearly.period')}${discountSuffix}`}
        features={[
          t('upgrade.plans.yearly.includesMonthly'),
          ...UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) =>
            t(`upgrade.plans.proFeatures.${feature.key}`),
          ),
        ]}
        selected={selectedInterval === 'yearly'}
        onSelect={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${monthlyCharge}${t('upgrade.plans.monthly.period')}`}
        features={UPGRADE_PRO_FEATURES.map((feature) =>
          t(`upgrade.plans.proFeatures.${feature.key}`),
        )}
        selected={selectedInterval === 'monthly'}
        onSelect={() => onSelectInterval('monthly')}
      />
    </View>
  )
}
