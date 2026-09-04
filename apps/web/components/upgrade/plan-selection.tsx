import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { domMax, LazyMotion, m, useAnimate, useReducedMotion } from 'motion/react'
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

const selectionTransition = {
  duration: motionDurations.fast / 1000,
  ease: motionEasings.standard,
} as const

function PlanLoadMotion({
  stateKey,
  children,
  reduced,
}: Readonly<{ stateKey: string; children: ReactNode; reduced: boolean }>) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const previousStateKey = useRef(stateKey)

  useEffect(() => {
    const shouldEnter = previousStateKey.current === 'loading' && stateKey !== 'loading'
    previousStateKey.current = stateKey
    if (reduced || !shouldEnter) return

    void animate(scope.current, { opacity: [0, 1] }, {
      duration: motionDurations.base / 1000,
      ease: motionEasings.enter,
    })
  }, [animate, reduced, scope, stateKey])

  return (
    <LazyMotion features={domMax}>
      <m.div
        ref={scope}
        data-motion-purpose="preventing a jarring change"
      >
        {children}
      </m.div>
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
  const [motionScope, animate] = useAnimate<HTMLDivElement>()
  const prefersReducedMotion = Boolean(useReducedMotion())
  const checkoutPending = checkoutLoading !== null

  const selectInterval = (interval: string) => {
    if (interval !== 'monthly' && interval !== 'yearly') return
    setSelectedInterval(interval)
    if (prefersReducedMotion) return
    void animate(
      '[data-upgrade-interval-motion]',
      { opacity: [0.72, 1], transform: ['scale(0.98)', 'scale(1)'] },
      selectionTransition,
    )
    void animate(
      '[data-upgrade-recommended-motion]',
      { opacity: [0.58, 1], transform: ['scale(0.97)', 'scale(1)'] },
      selectionTransition,
    )
  }

  const intervalControl = (
    <div data-upgrade-interval-motion="" data-motion-purpose="state indication">
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
        <div ref={motionScope} className="mt-8 flex flex-col gap-4" aria-label={t('upgrade.plans.loading')}>
          {intervalControl}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
            <Skeleton variant="stat-tile" label={t('upgrade.plans.loading')} />
          </div>
        </div>
      </PlanLoadMotion>
    )
  }

  if (isError && !plans && isOnline) {
    return (
      <PlanLoadMotion stateKey="error" reduced={prefersReducedMotion}>
        <div ref={motionScope} className="mt-8 flex flex-col gap-4">
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
      <div ref={motionScope} className="mt-8 flex flex-col items-stretch gap-4">
        {intervalControl}
        <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2">
          {tiers.map((tier) => (
            <TierCard
              key={tier.interval}
              tier={tier}
              recommended={tier.interval === 'yearly'}
              loading={checkoutLoading === tier.interval}
              disabled={checkoutPending || checkoutDisabled}
              reducedMotion={prefersReducedMotion}
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
  loading,
  disabled,
  reducedMotion,
  onCheckout,
  t,
}: Readonly<{
  tier: Tier
  recommended: boolean
  loading: boolean
  disabled: boolean
  reducedMotion: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  t: ReturnType<typeof useTranslations>
}>) {
  return (
    <m.section
      layout={reducedMotion ? false : 'position'}
      transition={reducedMotion ? { duration: 0 } : {
        duration: motionDurations.base / 1000,
        ease: motionEasings.standard,
      }}
      data-motion-purpose="spatial consistency"
      data-selected={recommended || undefined}
      className="flex min-w-0 flex-col gap-2 rounded-[var(--r-card)] p-6"
      style={{
        background: recommended ? 'var(--primary-dim)' : 'var(--bg-card)',
        boxShadow: recommended
          ? 'inset 0 0 0 1.5px var(--primary)'
          : 'inset 0 0 0 1px var(--hairline)',
      }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="min-w-0 flex-1 text-[17px] font-medium leading-[1.3]">{tier.name}</h2>
        {recommended ? (
          <span data-upgrade-recommended-motion="" data-motion-purpose="state indication">
            <Badge>{t('upgrade.plans.recommended')}</Badge>
          </span>
        ) : null}
      </div>
      <p className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">
        {tier.price}<span className="font-sans text-base font-normal text-[var(--fg-3)]">{tier.period}</span>
      </p>
      {tier.heroLine ? <p className="text-pretty text-sm leading-[1.5] text-[var(--fg-2)]">{tier.heroLine}</p> : null}
      {tier.secondLine ? <p className="font-mono text-xs leading-[1.5] tabular-nums text-[var(--fg-3)]">{tier.secondLine}</p> : null}
      {tier.couponLine ? <p className="text-sm leading-[1.5] text-[var(--fg-2)]">{tier.couponLine}</p> : null}
      <div className="mt-auto pt-2 [&>button]:w-full">
        <PillButton
          variant={recommended ? 'primary' : 'ghost'}
          loading={loading}
          disabled={disabled}
          accessibleName={t('upgrade.plans.checkoutLabel', { interval: tier.name })}
          onClick={() => onCheckout(tier.interval)}
        >
          {t('upgrade.plans.cta')}
        </PillButton>
      </div>
    </m.section>
  )
}
