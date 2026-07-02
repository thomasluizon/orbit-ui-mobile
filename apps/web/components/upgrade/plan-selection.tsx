import { useTranslations } from 'next-intl'
import { UPGRADE_PRO_FEATURES } from '@orbit/shared/utils/upgrade'
import { PlanCard } from '@/components/upgrade/plan-card'
import { formatPrice, monthlyEquivalent, useSubscriptionPlans } from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PlanSelectionProps {
  plans: NonNullable<ReturnType<typeof useSubscriptionPlans>['plans']>
  discountedAmount: (amount: number) => number
  trialActive: boolean
  checkoutLoading: string | null
  onCheckout: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  t: ReturnType<typeof useTranslations>
}

export function PlanSelection({
  plans,
  discountedAmount,
  trialActive,
  checkoutLoading,
  onCheckout,
  onStayFree,
  t,
}: Readonly<PlanSelectionProps>) {
  const yearlyAmount = discountedAmount(plans.yearly.unitAmount)
  const monthlyAmount = discountedAmount(plans.monthly.unitAmount)
  const yearlySavings = Math.max(0, monthlyAmount * 12 - yearlyAmount)
  const period = t('upgrade.plans.monthly.period')
  const proCtaLabel = trialActive ? t('upgrade.convert.trialCta') : t('upgrade.convert.freeCta')
  const marquee = UPGRADE_PRO_FEATURES.map((feature) => t(`upgrade.plans.proFeatures.${feature.key}`))

  return (
    <div className="grid grid-cols-1 items-stretch stagger-enter md:grid-cols-3" style={{ gap: 16 }}>
      <PlanCard
        variant="free"
        name={t('upgrade.free')}
        price={formatPrice(0, plans.currency)}
        period={period}
        sub={t('upgrade.plans.free.note')}
        ctaLabel={t('upgrade.convert.stayFree')}
        onCta={onStayFree}
      />
      <PlanCard
        variant="hero"
        name={t('upgrade.plans.yearly.name')}
        badge={t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}
        price={formatPrice(monthlyEquivalent(yearlyAmount), plans.currency)}
        period={period}
        sub={t('upgrade.plans.yearly.billedSave', {
          price: formatPrice(yearlyAmount, plans.currency),
          amount: formatPrice(yearlySavings, plans.currency),
        })}
        heroLine={t('upgrade.plans.yearly.heroLine')}
        ctaLabel={proCtaLabel}
        onCta={() => onCheckout('yearly')}
        busy={checkoutLoading === 'yearly'}
        ctaTestId="paywall-checkout"
      />
      <PlanCard
        variant="anchor"
        name={t('upgrade.plans.monthly.name')}
        price={formatPrice(monthlyAmount, plans.currency)}
        period={period}
        sub={t('upgrade.plans.monthly.note')}
        features={marquee}
        ctaLabel={t('upgrade.plans.monthly.cta')}
        onCta={() => onCheckout('monthly')}
        busy={checkoutLoading === 'monthly'}
      />
    </div>
  )
}
