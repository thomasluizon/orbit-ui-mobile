import { useTranslations } from 'next-intl'
import { PlanCard } from '@/components/upgrade/plan-card'
import { Badge } from '@/components/ui/badge'
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
  void trialActive
  void checkoutLoading

  return (
    <div className="grid grid-cols-1 items-stretch stagger-enter" style={{ gap: 16 }}>
      <PlanCard
        name={t('upgrade.free')}
        price={formatPrice(0, plans.currency)}
        onClick={onStayFree}
      />
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={<Badge>{t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}</Badge>}
        price={formatPrice(monthlyEquivalent(yearlyAmount), plans.currency)}
        onClick={() => onCheckout('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={formatPrice(monthlyAmount, plans.currency)}
        onClick={() => onCheckout('monthly')}
      />
    </div>
  )
}
