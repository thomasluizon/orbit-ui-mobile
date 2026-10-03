import { ProPitch } from './pro-pitch'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { PlanSelection } from './plan-selection'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'

type SubscriptionInterval = 'monthly' | 'yearly'

interface PricingSectionProps {
  stayFreeHref?: string
  dateHint?: string
  focusOnMount?: boolean
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
  stayFreeHref = '/profile',
  focusOnMount = false,
  dateHint,
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
  return (
    <div className="flex flex-col gap-8">
      <ProPitch dateHint={dateHint} profile={profile} trialDaysLeft={trialDaysLeft} t={t} focusOnMount={focusOnMount} />

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

        <div className="flex flex-col items-start gap-4">
          {plans ? <div className="flex flex-col items-start gap-2">
              <p
                role="alert"
                className="text-left text-sm leading-[1.55] text-[var(--fg-2)]"
              >
                {checkoutError}
              </p>
              <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">
                {t('upgrade.convert.cancelAnytime')}
              </p>
              <p className="max-w-[52ch] text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
                {t('upgrade.plans.renewalNote')}
              </p>
              <p className="max-w-[52ch] text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">
                {t('upgrade.convert.handOff')}
              </p>
            </div> : null}
            <Link
              href={stayFreeHref}
              aria-disabled={checkoutLoading !== null}
              onClick={(event) => {
                if (checkoutLoading !== null) {
                  event.preventDefault()
                  return
                }
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
                event.preventDefault()
                onStayFree()
              }}
              className="inline-flex min-h-11 items-center text-base leading-6 text-[var(--fg-1)] underline underline-offset-4 transition-colors duration-[var(--dur-hover)] ease-[var(--ease-standard)] hover:text-[var(--fg-2)] active:scale-[0.96] aria-disabled:pointer-events-none aria-disabled:opacity-40"
            >
              {t('upgrade.convert.stayFree')}
            </Link>
          </div>
      </div>
    </div>
  )
}
