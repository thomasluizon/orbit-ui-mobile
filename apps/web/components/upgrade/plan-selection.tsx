import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { AnimatePresence, domMax, LazyMotion, m, useReducedMotion } from 'motion/react'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatPrice,
  monthlyEquivalent,
  useSubscriptionPlans,
} from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PlanSelectionProps {
  plans: ReturnType<typeof useSubscriptionPlans>['plans']
  isLoading: boolean
  isError: boolean
  isOnline: boolean
  discountedAmount: (amount: number) => number
  checkoutLoading: SubscriptionInterval | null
  checkoutDisabled?: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  onRetry: () => void
  t: ReturnType<typeof useTranslations>
}

interface Tier {
  interval: SubscriptionInterval
  name: string
  price: string
  period: string
  heroLine?: string
  secondLine?: string
  couponLine?: string
}

function PlanLoadMotion({
  stateKey,
  children,
  reduced,
}: Readonly<{ stateKey: string; children: ReactNode; reduced: boolean }>) {
  return (
    <LazyMotion features={domMax}>
      <AnimatePresence initial={false} mode="popLayout">
        <m.div
          key={stateKey}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced
            ? { opacity: 1 }
            : {
                opacity: 0,
                transition: {
                  duration: motionDurations.routeExit / 1000,
                  ease: motionEasings.exit,
                },
              }}
          transition={reduced
            ? { duration: 0 }
            : {
                duration: motionDurations.base / 1000,
                ease: motionEasings.enter,
              }}
          data-motion-purpose="preventing a jarring change"
        >
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  )
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
  onRetry,
  t,
}: Readonly<PlanSelectionProps>) {
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const prefersReducedMotion = Boolean(useReducedMotion())
  const checkoutPending = checkoutLoading !== null

  const selectInterval = (interval: string) => {
    if (interval !== 'monthly' && interval !== 'yearly') return
    setSelectedInterval(interval)
  }

  const intervalControl = (
    <div>
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
    </div>
  )

  if (isLoading) {
    return (
      <PlanLoadMotion stateKey="loading" reduced={prefersReducedMotion}>
        <div className="flex flex-col gap-4" aria-label={t('upgrade.plans.loading')}>
          {intervalControl}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[0, 1].map((tierIndex) => (
              <div key={tierIndex} className="flex flex-col gap-3">
                {[0, 1, 2].map((rowIndex) => (
                  <Skeleton
                    key={rowIndex}
                    variant="settings"
                    label={t('upgrade.plans.loading')}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </PlanLoadMotion>
    )
  }

  if (isError && !plans && isOnline) {
    return (
      <PlanLoadMotion stateKey="error" reduced={prefersReducedMotion}>
        <div className="flex flex-col gap-4">
          {intervalControl}
          <ErrorState
            message={t('upgrade.plans.error')}
            action={<PillButton variant="ghost" onClick={onRetry}>{t('upgrade.plans.retry')}</PillButton>}
          />
        </div>
      </PlanLoadMotion>
    )
  }

  if (!plans) return null

  const yearlyAmount = discountedAmount(plans.yearly.unitAmount)
  const annualTier: Tier = {
    interval: 'yearly',
    name: t('upgrade.plans.yearly.name'),
    price: formatPrice(yearlyAmount, plans.currency),
    period: t('upgrade.plans.yearly.period'),
    heroLine: t('upgrade.plans.yearly.heroLine'),
    secondLine: t('upgrade.plans.yearly.equivalent', {
      price: formatPrice(monthlyEquivalent(yearlyAmount), plans.currency),
      percent: plans.savingsPercent,
    }),
    couponLine: plans.couponPercentOff
      ? t('upgrade.plans.coupon.line', { percent: plans.couponPercentOff })
      : undefined,
  }
  const monthlyTier: Tier = {
    interval: 'monthly',
    name: t('upgrade.plans.monthly.name'),
    price: formatPrice(discountedAmount(plans.monthly.unitAmount), plans.currency),
    period: t('upgrade.plans.monthly.period'),
    couponLine: plans.couponPercentOff
      ? t('upgrade.plans.coupon.line', { percent: plans.couponPercentOff })
      : undefined,
  }
  const tiers = selectedInterval === 'yearly'
    ? [annualTier, monthlyTier]
    : [monthlyTier, annualTier]

  return (
    <PlanLoadMotion stateKey="loaded" reduced={prefersReducedMotion}>
      <div className="flex flex-col items-stretch gap-4">
        {intervalControl}
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
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
            />
          ))}
        </div>
      </div>
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
}: Readonly<{
  tier: Tier
  recommended: boolean
  selected: boolean
  loading: boolean
  disabled: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  t: ReturnType<typeof useTranslations>
}>) {
  return (
    <section
      data-selected={selected || undefined}
      className="flex min-w-0 flex-col gap-2 rounded-[var(--r-card)] p-6"
      style={{
        background: selected ? 'var(--primary-dim)' : 'var(--bg-card)',
        boxShadow: selected
          ? 'inset 0 0 0 1.5px var(--primary)'
          : 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="min-w-0 flex-1 text-[17px] font-medium leading-[1.3]">{tier.name}</h2>
          {recommended ? (
            <Badge>{t('upgrade.plans.recommended')}</Badge>
          ) : null}
        </div>
        <p className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">
          {tier.price}<span className="font-sans text-base font-normal text-[var(--fg-3)]">{tier.period}</span>
        </p>
        {tier.heroLine ? <p className="text-pretty text-sm leading-[1.5] text-[var(--fg-2)]">{tier.heroLine}</p> : null}
        {tier.secondLine ? <p className="font-mono text-xs leading-[1.5] tabular-nums text-[var(--fg-3)]">{tier.secondLine}</p> : null}
        {tier.couponLine ? <p className="text-sm leading-[1.5] text-[var(--fg-2)]">{tier.couponLine}</p> : null}
      </div>
      <div className="pt-2">
        <PillButton
          fullWidth
          variant={selected ? 'primary' : 'ghost'}
          loading={loading}
          disabled={disabled}
          accessibleName={t(recommended ? 'upgrade.plans.checkoutLabelRecommended' : 'upgrade.plans.checkoutLabel', { interval: tier.name })}
          onClick={() => onCheckout(tier.interval)}
        >
          {t('upgrade.plans.cta')}
        </PillButton>
      </div>
    </section>
  )
}
