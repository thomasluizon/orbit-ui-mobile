import { AlertTriangle, Tag } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PlanSelection } from './plan-selection'
import { PlanComparisonCards } from './plan-comparison-cards'
import { cardSurface } from './styles'
import { plural } from '@/lib/plural'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PricingSectionProps {
  profile: { isTrialActive?: boolean } | null
  plans: ReturnType<typeof useSubscriptionPlans>['plans']
  isLoadingPlans: boolean
  isPlansError: boolean
  trialDaysLeft: number | null
  checkoutLoading: string | null
  checkoutError: string
  discountedAmount: (amount: number) => number
  onCheckout: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  onRetryPlans: () => void
  t: ReturnType<typeof useTranslations>
}

export function PricingSection({
  profile,
  plans,
  isLoadingPlans,
  isPlansError,
  trialDaysLeft,
  checkoutLoading,
  checkoutError,
  discountedAmount,
  onCheckout,
  onStayFree,
  onRetryPlans,
  t,
}: Readonly<PricingSectionProps>) {
  const trialActive = !!profile?.isTrialActive
  const eyebrow = trialActive
    ? trialDaysLeft === 0
      ? t('upgrade.convert.trialLastDay')
      : plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)
    : t('upgrade.convert.freeEyebrow')
  const heading = trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (
    <>
      <header style={{ marginBottom: 20 }}>
        <p className="t-eyebrow" style={{ margin: 0, color: 'var(--primary-soft)' }}>
          {eyebrow}
        </p>
        <h1 className="t-display" style={{ margin: '6px 0 0', textWrap: 'balance' }}>
          {heading}
        </h1>
        <p className="t-secondary" style={{ margin: '10px 0 0', maxWidth: '46ch' }}>
          {t('upgrade.convert.promise')}
        </p>
        {!trialActive ? (
          <p className="t-meta" style={{ margin: '10px 0 0', maxWidth: '46ch' }}>
            {t('upgrade.convert.trustLine')}
          </p>
        ) : null}
      </header>

      {isLoadingPlans ? (
        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-[18px]" style={{ padding: '22px', ...cardSurface }}>
              <div className="skeleton-pulse h-4 w-20 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              <div className="skeleton-pulse mt-3 h-7 w-24 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              <div className="skeleton-pulse mt-5 h-9 w-full rounded-full" style={{ background: 'var(--bg-elev-2)' }} />
            </div>
          ))}
        </div>
      ) : null}

      {isPlansError && !plans && !isLoadingPlans ? (
        <div className="rounded-[18px] text-center" style={{ padding: '28px 18px', ...cardSurface }}>
          <AlertTriangle size={26} strokeWidth={1.8} className="mx-auto text-[var(--fg-3)]" />
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('upgrade.plans.error')}
          </p>
          <button type="button" className="chip touch-target" style={{ marginTop: 10 }} onClick={onRetryPlans}>
            {t('upgrade.plans.retry')}
          </button>
        </div>
      ) : null}

      {plans ? (
        <>
          <PlanSelection
            plans={plans}
            discountedAmount={discountedAmount}
            trialActive={trialActive}
            checkoutLoading={checkoutLoading}
            onCheckout={onCheckout}
            onStayFree={onStayFree}
            t={t}
          />

          <div className="flex flex-col items-center" style={{ gap: 6, marginTop: 20 }}>
            {plans.couponPercentOff ? (
              <p
                className="flex items-center justify-center"
                style={{ gap: 6, margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--status-done)' }}
              >
                <Tag size={13} strokeWidth={1.8} aria-hidden="true" />
                {t('upgrade.plans.coupon.appliedNote')}
              </p>
            ) : null}
            {checkoutError ? (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--status-bad)' }}>
                {checkoutError}
              </p>
            ) : null}
            <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500, color: 'var(--fg-2)' }}>
              {t('upgrade.convert.cancelAnytime')}
            </p>
            <p
              className="text-center"
              style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--fg-3)', maxWidth: '52ch' }}
            >
              {t('upgrade.plans.renewalNote')}
            </p>
          </div>

          <PlanComparisonCards t={t} />
        </>
      ) : null}
    </>
  )
}
