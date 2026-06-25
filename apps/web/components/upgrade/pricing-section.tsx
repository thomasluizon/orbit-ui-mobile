import {
  AlertTriangle, Check, Clock, Loader2, Sparkles, Tag,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TRIAL_EXPIRED_FEATURE_KEYS } from '@orbit/shared/utils/upgrade'
import { PillButton } from '@/components/ui/pill-button'
import { plural } from '@/lib/plural'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { PlanSelection } from './plan-selection'
import { PlanComparisonCards } from './plan-comparison-cards'
import { cardSurface } from './styles'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PricingSectionProps {
  profile: { isTrialActive?: boolean } | null
  plans: ReturnType<typeof useSubscriptionPlans>['plans']
  isLoadingPlans: boolean
  isPlansError: boolean
  trialExpired: boolean
  trialDaysLeft: number | null
  trialUrgent: boolean
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  checkoutLoading: string | null
  checkoutError: string
  discountedAmount: (amount: number) => number
  onCheckout: (interval: SubscriptionInterval) => void
  onRetryPlans: () => void
  t: ReturnType<typeof useTranslations>
}

export function PricingSection({
  profile, plans, isLoadingPlans, isPlansError, trialExpired, trialDaysLeft, trialUrgent,
  selectedInterval, onSelectInterval, checkoutLoading, checkoutError, discountedAmount,
  onCheckout, onRetryPlans, t,
}: Readonly<PricingSectionProps>) {
  return (
    <>
      <h1
        style={{
          margin: '0 0 22px',
          fontFamily: 'var(--font-sans)',
          fontSize: 24,
          fontWeight: 500,
          lineHeight: 1.3,
          letterSpacing: '-0.01em',
          color: 'var(--fg-1)',
          textWrap: 'balance',
        }}
      >
        {t('upgrade.heroTitle')}
      </h1>

      {profile?.isTrialActive && (
        <div
          className="flex items-center rounded-[14px]"
          style={{
            padding: '12px 16px',
            gap: 10,
            marginBottom: 16,
            background: trialUrgent
              ? 'color-mix(in srgb, var(--status-overdue) 10%, transparent)'
              : 'rgba(var(--primary-rgb), 0.08)',
            boxShadow: trialUrgent
              ? 'inset 0 0 0 1px color-mix(in srgb, var(--status-overdue) 28%, transparent)'
              : 'inset 0 0 0 1px rgba(var(--primary-rgb), 0.18)',
          }}
        >
          <Clock
            size={16}
            strokeWidth={1.8}
            className={`shrink-0 ${trialUrgent ? 'text-[var(--status-overdue)]' : 'text-[var(--primary-soft)]'}`}
          />
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              color: trialUrgent ? 'var(--status-overdue-text)' : 'var(--fg-1)',
            }}
          >
            {trialDaysLeft === 0
              ? t('trial.banner.lastDay')
              : plural(t('trial.banner.daysLeft', { days: trialDaysLeft ?? 0 }), trialDaysLeft ?? 0)}
          </p>
        </div>
      )}

      {trialExpired && (
        <div className="rounded-[18px]" style={{ padding: 18, marginBottom: 16, ...cardSurface }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <Sparkles size={18} strokeWidth={1.8} className="shrink-0 text-[var(--primary-soft)]" />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 500, color: 'var(--fg-1)' }}>
              {t('trial.expired.title')}
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-3)' }}>
            {t('trial.expired.dontLose')}
          </p>
          <div className="flex flex-col" style={{ gap: 9, marginTop: 12 }}>
            {TRIAL_EXPIRED_FEATURE_KEYS.map((feature) => (
              <div key={feature} className="flex items-center" style={{ gap: 10 }}>
                <Check size={16} strokeWidth={2.4} className="shrink-0 text-[var(--primary-soft)]" aria-hidden="true" />
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
                  {t(feature)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoadingPlans && (
        <div className="flex flex-col" style={{ gap: 14, marginBottom: 22 }}>
          {[1, 2].map((i) => (
            <div key={i} className="rounded-[18px]" style={{ padding: '18px 18px 20px', ...cardSurface }}>
              <div className="flex items-center justify-between">
                <div className="skeleton-pulse h-4 w-24 rounded" style={{ background: 'var(--bg-elev-2)' }} />
                <div className="skeleton-pulse size-6 rounded-full" style={{ background: 'var(--bg-elev-2)' }} />
              </div>
              <div className="skeleton-pulse mt-3 h-5 w-28 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              <div className="mt-4 space-y-2.5">
                <div className="skeleton-pulse h-3 w-3/4 rounded" style={{ background: 'var(--bg-elev-2)' }} />
                <div className="skeleton-pulse h-3 w-1/2 rounded" style={{ background: 'var(--bg-elev-2)' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isPlansError && !plans && !isLoadingPlans && (
        <div className="rounded-[18px] text-center" style={{ padding: '28px 18px', marginBottom: 22, ...cardSurface }}>
          <AlertTriangle size={26} strokeWidth={1.8} className="mx-auto text-[var(--fg-3)]" />
          <p style={{ margin: '10px 0 0', fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--fg-2)' }}>
            {t('upgrade.plans.error')}
          </p>
          <button
            type="button"
            className="chip"
            style={{ marginTop: 10 }}
            onClick={onRetryPlans}
          >
            {t('upgrade.plans.retry')}
          </button>
        </div>
      )}

      {plans && (
        <>
          <PlanSelection
            plans={plans}
            selectedInterval={selectedInterval}
            onSelectInterval={onSelectInterval}
            discountedAmount={discountedAmount}
            t={t}
          />

          <div className="flex flex-col items-stretch" style={{ gap: 12, marginTop: 22 }}>
            {plans.couponPercentOff ? (
              <p
                className="flex items-center justify-center"
                style={{ gap: 6, margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--status-done)' }}
              >
                <Tag size={13} strokeWidth={1.8} aria-hidden="true" />
                {t('upgrade.plans.coupon.appliedNote')}
              </p>
            ) : null}
            <PillButton
              fullWidth
              disabled={!!checkoutLoading}
              dataTestId="paywall-checkout"
              onClick={() => onCheckout(selectedInterval)}
              leading={checkoutLoading
                ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                : <Sparkles size={18} strokeWidth={1.8} aria-hidden="true" />}
            >
              {selectedInterval === 'yearly' ? t('upgrade.plans.yearly.cta') : t('upgrade.plans.monthly.cta')}
            </PillButton>
            {checkoutLoading ? (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)' }}>
                {t('common.loading')}
              </p>
            ) : null}
            {checkoutError && (
              <p className="text-center" style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--status-bad)' }}>
                {checkoutError}
              </p>
            )}
            <p
              className="text-center"
              style={{ margin: '4px 4px 0', fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--fg-3)' }}
            >
              {t('upgrade.plans.renewalNote')}
            </p>
          </div>
        </>
      )}

      <PlanComparisonCards t={t} />
    </>
  )
}
