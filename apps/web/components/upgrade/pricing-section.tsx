import { Calendar, Eye, FileText } from '@/components/ui/icons'
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
  } else if (trialDaysLeft <= 1) {
    eyebrow = t('upgrade.convert.trialLastDay')
  } else {
    eyebrow = plural(t('upgrade.convert.trialDaysLeft', { days: trialDaysLeft }), trialDaysLeft)
  }
  const heading = trialActive ? t('upgrade.convert.trialHeading') : t('upgrade.convert.freeHeading')

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)]">
          {eyebrow}
        </p>
        <h1 className="font-display text-[28px] font-medium leading-[1.18] tracking-[-0.02em] text-pretty text-[var(--fg-1)] sm:text-[34px] sm:leading-[1.15]">
          {heading}
        </h1>
        <p className="t-secondary max-w-[46ch] text-pretty">
          {t('upgrade.convert.promise')}
        </p>
        {!trialActive ? (
          <p className="text-sm leading-[1.55] text-[var(--fg-3)]">
            {t('upgrade.convert.trustLine')}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-3" aria-label={t('upgrade.convert.allowanceLabel')}>
        <div className="grid grid-cols-[1fr_1px_1fr] gap-4 rounded-[var(--r-card)] bg-[var(--bg-card)] p-4 shadow-[inset_0_0_0_1px_var(--hairline)] sm:p-6">
          <Allowance amount={t('upgrade.convert.freeAllowance')} label={t('upgrade.free')} perDay={t('upgrade.convert.perDay')} />
          <span aria-hidden="true" className="h-full w-px bg-[var(--hairline)]" />
          <Allowance amount={t('upgrade.convert.proAllowance')} label="Pro" perDay={t('upgrade.convert.perDay')} />
        </div>
        <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
          {t('upgrade.convert.allowanceNote')}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-label={t('upgrade.outcomes.label')}>
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

      <div className="flex flex-col gap-4">
        <PlanSelection
          plans={plans}
          isLoading={isLoadingPlans}
          isError={isPlansError}
          isOnline={isOnline}
          discountedAmount={discountedAmount}
          checkoutLoading={checkoutLoading}
          checkoutDisabled={!isOnline}
          onCheckout={onCheckout}
          onRetry={onRetryPlans}
          t={t}
        />

        {plans ? (
          <div className="flex flex-col items-start gap-4">
            <div className="flex flex-col items-start gap-2">
              {checkoutError ? (
                <p
                  role="alert"
                  aria-live="polite"
                  className="text-center text-xs text-[var(--status-bad)]"
                >
                  {checkoutError}
                </p>
              ) : null}
              <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">
                {t('upgrade.convert.cancelAnytime')}
              </p>
              <p className="max-w-[52ch] text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
                {t('upgrade.plans.renewalNote')}
              </p>
              <p className="max-w-[52ch] text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
                {t('upgrade.convert.handOff')}
              </p>
            </div>
            <a
              href="/profile"
              aria-disabled={checkoutLoading !== null}
              onClick={(event) => {
                event.preventDefault()
                if (checkoutLoading === null) onStayFree()
              }}
              className="inline-flex min-h-11 items-center text-base leading-6 text-[var(--fg-1)] underline underline-offset-4 transition-colors duration-[var(--dur-hover-control)] hover:text-[var(--fg-2)] active:scale-[0.96] aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              {t('upgrade.convert.stayFree')}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Allowance({ amount, label, perDay }: Readonly<{ amount: string; label: string; perDay: string }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)]">{label}</p>
      <p className="font-display text-[34px] font-semibold leading-[1.02] tracking-[-0.02em] tabular-nums text-[var(--fg-1)] sm:text-[44px]">
        {amount}
      </p>
      <p className="text-sm leading-[1.4] text-[var(--fg-3)]">{perDay}</p>
    </div>
  )
}
