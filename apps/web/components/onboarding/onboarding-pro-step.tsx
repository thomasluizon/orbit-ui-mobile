'use client'

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { buildAccountScopedStorageKey, getTrialDaysLeft, TRIAL_EXPIRED_SEEN_KEY } from '@orbit/shared/utils'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import { useOnboardingPlan } from '@/hooks/use-onboarding-plan'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useStripeCheckout } from '@/hooks/use-stripe-checkout'
import { useOffline } from '@/hooks/use-offline'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'

export interface OnboardingProExit { exit: (destination?: string) => void }

export function OnboardingProStep({ onFinish, ref }: Readonly<{ onFinish: (destination?: string) => Promise<void>; ref?: Ref<OnboardingProExit> }>) {
  const t = useTranslations()
  const locale = useLocale()
  const { plan, profile, retry } = useOnboardingPlan()
  const { isOnline } = useOffline()
  const plans = useSubscriptionPlans({ enabled: plan === 'Free', handlesError: true })
  const [finishing, setFinishing] = useState(false)
  const [finishFailed, setFinishFailed] = useState(false)
  const finishPending = useRef(false)
  const paidExitStarted = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { checkout, checkoutLoading, checkoutError } = useStripeCheckout(() => finish())

  async function finish(destination?: string) {
    if (finishPending.current) return
    finishPending.current = true
    setFinishing(true)
    setFinishFailed(false)
    const accountId = getHeldAccountId()
    const generation = getAccountGeneration()
    try {
      if (plan === 'Free' && accountId !== null) localStorage.setItem(buildAccountScopedStorageKey(TRIAL_EXPIRED_SEEN_KEY, accountId), '1')
      if (getAccountGeneration() === generation) await onFinish(destination)
    } catch {
      setFinishFailed(true)
      throw new Error('Onboarding completion failed')
    } finally {
      finishPending.current = false
      setFinishing(false)
    }
  }
  function exit(destination?: string) {
    if (checkoutLoading !== null || finishing) return
    void finish(destination).catch(() => {})
  }
  useImperativeHandle(ref, () => ({ exit }))
  useEffect(() => {
    headingRef.current?.focus()
  }, [plan])
  useEffect(() => {
    if (plan !== 'Pro' || paidExitStarted.current) return
    paidExitStarted.current = true
    void finish().catch(() => {})
  })

  const title = <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} translate="no" className="text-[length:var(--fs-lg)] font-medium text-pretty">{t('upgrade.pitchTitle')}</h1>
  const exitAction = <PillButton variant="ghost" loading={finishing} onClick={() => exit()}>{t('onboarding.flow.done.seeDay')}</PillButton>
  let content
  if (plan === 'loading' || plan === 'Pro') content = <section aria-busy aria-label={t('common.loading')} className="flex flex-col gap-6">{title}<ProSkeleton />{exitAction}</section>
  else if (plan === null) content = <section className="flex flex-col gap-6">{title}<ErrorState message={t('upgrade.billing.error')} action={<PillButton variant="ghost" onClick={retry}>{t('upgrade.billing.retry')}</PillButton>} />{exitAction}</section>
  else if (plan === 'Trial') content = <section data-onboarding-step="trial" className="flex flex-col gap-8"><ProPitch focusOnMount headingId="onboarding-title" profile={profile ?? null} trialDaysLeft={getTrialDaysLeft(profile)} titleKey="onboarding.flow.trial.title" bodyKey="onboarding.flow.trial.body" dateHint={profile?.trialEndsAt ? t('upgrade.billing.plan.trialHint', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(profile.trialEndsAt)) }) : undefined} t={t} /><PillButton loading={finishing} onClick={() => exit()}>{t('onboarding.flow.done.seeDay')}</PillButton></section>
  else content = <section data-onboarding-step="paywall" className="flex flex-col gap-6">{title}{!isOnline ? <ErrorState message={t('upgrade.billing.offline')} /> : null}<PricingSection profile={null} plans={plans.plans} isLoadingPlans={plans.isLoading} isPlansError={plans.isError} isOnline={isOnline} trialDaysLeft={null} checkoutLoading={checkoutLoading ?? (finishing ? 'yearly' : null)} checkoutError={checkoutError} discountedAmount={plans.discountedAmount} onCheckout={(interval) => void checkout(interval)} stayFreeHref="/" onStayFree={() => exit()} onRetryPlans={() => void plans.refetch()} t={t} /></section>
  return <div className="w-full py-8">{content}<p role="alert" className="text-sm text-[var(--fg-2)]">{finishFailed ? t('onboarding.flow.completionFailed') : ''}</p></div>
}

function ProSkeleton() {
  const block = 'rounded-[var(--r-well)] bg-[var(--bg-well)]'
  return <div aria-hidden="true" className="flex flex-col gap-8">
    <div className="flex flex-col gap-3"><div className={`${block} h-3 w-1/3`} /><div className={`${block} h-16 w-4/5`} /><div className={`${block} h-14 w-full`} /></div>
    <div className={`${block} h-[136px] w-full rounded-[var(--r-card)]`} />
    <div className="flex flex-col gap-3">{[0, 1, 2].map((key) => <div key={key} className={`${block} h-16 w-full`} />)}</div>
  </div>
}
