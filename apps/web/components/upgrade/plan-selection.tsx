import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PlanCard } from '@/components/upgrade/plan-card'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { formatPrice, useSubscriptionPlans } from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PlanSelectionProps {
  plans: ReturnType<typeof useSubscriptionPlans>['plans']
  isLoading: boolean
  isError: boolean
  isOnline: boolean
  discountedAmount: (amount: number) => number
  trialActive: boolean
  checkoutLoading: SubscriptionInterval | null
  checkoutDisabled?: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  onRetry: () => void
  t: ReturnType<typeof useTranslations>
}

export function PlanSelection({
  plans,
  isLoading,
  isError,
  isOnline,
  discountedAmount,
  checkoutLoading,
  checkoutDisabled = false,
  onCheckout,
  onStayFree,
  onRetry,
  t,
}: Readonly<PlanSelectionProps>) {
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')

  if (isLoading) {
    return (
      <div className="mt-8 flex flex-col gap-3" aria-label={t('upgrade.plans.loading')}>
        <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
        <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
      </div>
    )
  }

  if (isError && !plans && isOnline) {
    return (
      <div className="mt-8">
        <ErrorState
          message={t('upgrade.plans.error')}
          action={<PillButton variant="ghost" onClick={onRetry}>{t('upgrade.plans.retry')}</PillButton>}
        />
      </div>
    )
  }

  if (!plans) return null

  const yearlyAmount = discountedAmount(plans.yearly.unitAmount)
  const monthlyAmount = discountedAmount(plans.monthly.unitAmount)
  const checkoutPending = checkoutLoading !== null

  const handleIntervalChange = (interval: string) => {
    if (interval === 'monthly' || interval === 'yearly') setSelectedInterval(interval)
  }

  return (
    <div className="mt-8 flex flex-col items-stretch gap-4 stagger-enter">
      <SegmentedControl
        label={t('upgrade.plans.intervalLabel')}
        options={[
          { id: 'monthly', label: t('upgrade.plans.interval.monthly') },
          { id: 'yearly', label: t('upgrade.plans.interval.annual') },
        ]}
        value={selectedInterval}
        onChange={handleIntervalChange}
        disabled={checkoutPending}
      />
      <PlanCard
        name={t('upgrade.free')}
        price={formatPrice(0, plans.currency)}
        disabled={checkoutPending}
        onClick={onStayFree}
      />
      <PlanCard
        name={t('upgrade.plans.yearly.name')}
        badge={<Badge>{t('upgrade.plans.savePercent', { percent: plans.savingsPercent })}</Badge>}
        price={formatPrice(yearlyAmount, plans.currency)}
        selected={selectedInterval === 'yearly'}
        disabled={checkoutPending || checkoutDisabled}
        loading={checkoutLoading === 'yearly'}
        onClick={() => onCheckout('yearly')}
      />
      <PlanCard
        name={t('upgrade.plans.monthly.name')}
        price={formatPrice(monthlyAmount, plans.currency)}
        selected={selectedInterval === 'monthly'}
        disabled={checkoutPending || checkoutDisabled}
        loading={checkoutLoading === 'monthly'}
        onClick={() => onCheckout('monthly')}
      />
    </div>
  )
}
