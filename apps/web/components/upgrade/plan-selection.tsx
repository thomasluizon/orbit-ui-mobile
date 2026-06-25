import { useTranslations } from 'next-intl'
import {
  UPGRADE_PRO_FEATURES,
  UPGRADE_YEARLY_EXTRA_FEATURES,
} from '@orbit/shared/utils/upgrade'
import { PlanCard } from '@/components/upgrade/plan-card'
import { formatPrice, monthlyEquivalent, useSubscriptionPlans } from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PlanSelectionProps {
  plans: NonNullable<ReturnType<typeof useSubscriptionPlans>['plans']>
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  discountedAmount: (amount: number) => number
  t: ReturnType<typeof useTranslations>
}

export function PlanSelection({ plans, selectedInterval, onSelectInterval, discountedAmount, t }: Readonly<PlanSelectionProps>) {
  const yearlyAmount = discountedAmount(plans.yearly.unitAmount)
  const monthlyAmount = discountedAmount(plans.monthly.unitAmount)
  const discountSuffix = plans.couponPercentOff
    ? ` · ${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
    : ''

  return (
    <div role="radiogroup" aria-label={t('upgrade.plan')} className="flex flex-col stagger-enter" style={{ gap: 14 }}>
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        price={t('upgrade.plans.equivalent', {
          price: formatPrice(monthlyEquivalent(yearlyAmount), plans.currency),
        })}
        sub={`${formatPrice(yearlyAmount, plans.currency)}${t('upgrade.plans.yearly.period')}${discountSuffix}`}
        features={[
          t('upgrade.plans.yearly.includesMonthly'),
          ...UPGRADE_YEARLY_EXTRA_FEATURES.map((feature) => t(`upgrade.plans.proFeatures.${feature.key}`)),
        ]}
        selected={selectedInterval === 'yearly'}
        onSelect={() => onSelectInterval('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={`${formatPrice(monthlyAmount, plans.currency)}${t('upgrade.plans.monthly.period')}`}
        sub={plans.couponPercentOff
          ? `${t('upgrade.plans.coupon.discountBadge', { percent: plans.couponPercentOff })}`
          : undefined}
        features={UPGRADE_PRO_FEATURES.map((feature) => t(`upgrade.plans.proFeatures.${feature.key}`))}
        selected={selectedInterval === 'monthly'}
        onSelect={() => onSelectInterval('monthly')}
      />
    </div>
  )
}
