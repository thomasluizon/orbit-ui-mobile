import { Calendar, Eye, FileText, Tag } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { PlanSelection } from './plan-selection'
import { plural } from '@/lib/plural'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

const OUTCOMES = [
  { key: 'calendar', Icon: Calendar },
  { key: 'retrospective', Icon: FileText },
  { key: 'noticing', Icon: Eye },
] as const

interface PricingSectionProps {
  profile: { isTrialActive?: boolean } | null
  plans: ReturnType<typeof useSubscriptionPlans>['plans']
  isLoadingPlans: boolean
  isPlansError: boolean
  isOnline: boolean
  trialDaysLeft: number | null
  checkoutLoading: SubscriptionInterval | null
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
  isOnline,
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
  let eyebrow: string
  if (!trialActive) {
    eyebrow = t('upgrade.convert.freeEyebrow')
  } else if (trialDaysLeft === null) {
    eyebrow = t('upgrade.convert.trialEyebrow')
  } else if (trialDaysLeft === 0) {
    eyebrow = t('upgrade.convert.trialLastDay')
  } else {
    eyebrow = plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
  }
  const heading = trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="t-eyebrow text-[var(--fg-3)]">
          {eyebrow}
        </p>
        <h1 className="t-display text-pretty">
          {heading}
        </h1>
        <p className="t-secondary max-w-[46ch] text-pretty">
          {t('upgrade.convert.promise')}
        </p>
        {!trialActive ? (
          <p className="t-meta max-w-[46ch] text-pretty">
            {t('upgrade.convert.trustLine')}
          </p>
        ) : null}
      </header>

      <section className="mt-8 flex flex-col gap-3" aria-label={t('upgrade.convert.allowanceLabel')}>
        <div className="grid grid-cols-[1fr_1px_1fr] gap-6 rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">
          <Allowance amount={t('upgrade.convert.freeAllowance')} label={t('upgrade.free')} perDay={t('upgrade.convert.perDay')} />
          <span aria-hidden="true" className="h-full w-px bg-[var(--hairline)]" />
          <Allowance amount={t('upgrade.convert.proAllowance')} label="Pro" perDay={t('upgrade.convert.perDay')} />
        </div>
        <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
          {t('upgrade.convert.allowanceNote')}
        </p>
      </section>

      <section className="mt-8 flex flex-col gap-3" aria-label={t('upgrade.outcomes.label')}>
        {OUTCOMES.map(({ key, Icon }) => (
          <div key={key} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-1 grid size-6 shrink-0 place-items-center text-[var(--fg-3)]">
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[17px] font-medium leading-[1.4] text-[var(--fg-1)]">
                {t(`upgrade.outcomes.${key}.title`)}
              </p>
              <p className="text-pretty text-sm leading-[1.5] text-[var(--fg-3)]">
                {t(`upgrade.outcomes.${key}.body`)}
              </p>
            </div>
          </div>
        ))}
      </section>

      <PlanSelection
        plans={plans}
        isLoading={isLoadingPlans}
        isError={isPlansError}
        isOnline={isOnline}
        discountedAmount={discountedAmount}
        trialActive={trialActive}
        checkoutLoading={checkoutLoading}
        checkoutDisabled={!isOnline}
        onCheckout={onCheckout}
        onStayFree={onStayFree}
        onRetry={onRetryPlans}
        t={t}
      />

      {plans ? (
        <>
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
        </>
      ) : null}
    </>
  )
}

function Allowance({ amount, label, perDay }: Readonly<{ amount: string; label: string; perDay: string }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)]">{label}</p>
      <p className="font-display text-[44px] font-semibold leading-[1.02] tracking-[-0.02em] tabular-nums text-[var(--fg-1)]">
        {amount}
      </p>
      <p className="text-sm leading-[1.4] text-[var(--fg-3)]">{perDay}</p>
    </div>
  )
}
