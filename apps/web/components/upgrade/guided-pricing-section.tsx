'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { useTranslations } from 'next-intl'
import { motionDurations } from '@orbit/shared/theme'
import { resolveUpgradeOrbitLine, type AstraAllowance } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { moveFocusBetweenOptions } from '@/components/ui/option-card'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import { useOrbitLook } from '@/hooks/use-orbit-look'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useViewportMatch } from '@/hooks/use-viewport-match'
import { buildPlanTiers, type Tier } from './plan-selection'
import { StayFreeLink } from './pricing-section'
import { ProBenefits } from './pro-benefits'
import { AllowanceComparison, planFactLine } from './pro-pitch'

type SubscriptionInterval = 'monthly' | 'yearly'

/** In the compact shell the primary action is pinned to the bottom of the scroller, with the refusal of the handoff above it. It is the last child of the section, so at the end of the scroll it rests under the content and never covers a plan card. */
const PINNED_FOOTER_CLASS = 'sticky bottom-0 flex w-full flex-col items-center gap-[var(--orbit-space-8)] bg-[var(--bg)] pb-[var(--orbit-space-16)] pt-[var(--orbit-space-8)]'
/** A plan card that takes focus scrolls clear of the pinned footer: the footer padding plus the target height. */
const PINNED_FOOTER_CLEARANCE = 'calc(var(--touch-min) + var(--orbit-space-24))'
type UpgradeTranslations = ReturnType<typeof useTranslations>
type Plans = ReturnType<typeof useSubscriptionPlans>['plans']

export interface GuidedPricingSectionProps {
  /** The id of the question, for a host that names its region by it. */
  headingId?: string
  dateHint?: string
  focusOnMount?: boolean
  profile: ({ isTrialActive?: boolean } & AstraAllowance) | null
  /** The usage read of the person. It feeds the Orbit line. */
  usage: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  plans: Plans
  isLoadingPlans: boolean
  isPlansError: boolean
  isOnline: boolean
  trialDaysLeft: number | null
  checkoutLoading: SubscriptionInterval | null
  checkoutError: string
  discountedAmount: (amount: number) => number
  onCheckout: (interval: SubscriptionInterval) => void
  stayFreeHref?: string
  onStayFree: () => void
  onRetryPlans: () => void
  t: UpgradeTranslations
}

/** A plan card as an option of the question. A press selects it. The primary action starts the handoff. */
function PlanOption({ tier, recommended, selected, disabled, selectionDuration, onSelect, t }: Readonly<{
  tier: Tier
  recommended: boolean
  selected: boolean
  disabled: boolean
  selectionDuration: number
  onSelect: () => void
  t: UpgradeTranslations
}>) {
  return (
    <button
      type="button"
      data-option-card=""
      data-tier={tier.interval}
      data-selected={selected || undefined}
      data-selection-duration={selectionDuration}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onKeyDown={moveFocusBetweenOptions}
      className="orbit-option-card"
      style={{
        flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', gap: 8, padding: 'var(--orbit-space-16)', textAlign: 'start',
        background: selected ? 'var(--primary-dim)' : undefined,
        transitionDuration: `${selectionDuration}ms`,
        scrollMarginBottom: PINNED_FOOTER_CLEARANCE,
      }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 text-[17px] font-medium leading-[1.3]">{tier.name}</span>
        {recommended ? <Badge>{t('upgrade.plans.recommended')}</Badge> : null}
      </span>
      <span className="font-display text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums">
        {tier.price}<span className="font-sans text-base font-normal text-[var(--fg-2)]">{tier.period}</span>
      </span>
      {tier.heroLine ? <span className="text-pretty text-sm leading-[1.5] text-[var(--fg-2)]">{tier.heroLine}</span> : null}
      {tier.secondLine ? <span className="font-mono text-xs leading-[1.5] tabular-nums text-[var(--fg-2)]">{tier.secondLine}</span> : null}
      {tier.couponLine ? <span className="text-sm leading-[1.5] text-[var(--fg-2)]">{tier.couponLine}</span> : null}
    </button>
  )
}

function PlanOptions({ plans, isLoading, isError, isOnline, selected, disabled, discountedAmount, onSelect, onRetry, t }: Readonly<{
  plans: Plans
  isLoading: boolean
  isError: boolean
  isOnline: boolean
  selected: SubscriptionInterval
  disabled: boolean
  discountedAmount: (amount: number) => number
  onSelect: (interval: SubscriptionInterval) => void
  onRetry: () => void
  t: UpgradeTranslations
}>) {
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  if (isLoading) {
    return (
      <div data-plan-options="loading" className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
        {(['yearly', 'monthly'] as const).map((interval) => (
          <div key={interval} className="rounded-[20px] bg-[var(--bg-card)] p-4"><Skeleton variant="settings" rows={2} label={t('upgrade.plans.loading')} /></div>
        ))}
      </div>
    )
  }
  if (isError && !plans && isOnline) {
    return <ErrorState message={t('upgrade.plans.error')} action={
      <IconButton label={t('upgrade.plans.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
    } />
  }
  if (!plans) return null
  const { annualTier, monthlyTier } = buildPlanTiers(plans, discountedAmount, t)
  return (
    <div role="group" aria-label={t('upgrade.question')} data-option-group="" data-plan-options="loaded" className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      {[annualTier, monthlyTier].map((tier) => (
        <PlanOption
          key={tier.interval}
          tier={tier}
          recommended={tier.interval === 'yearly'}
          selected={tier.interval === selected}
          disabled={disabled}
          selectionDuration={reducedMotion ? motionDurations.instant : motionDurations.fast}
          onSelect={() => onSelect(tier.interval)}
          t={t}
        />
      ))}
    </div>
  )
}

/** What stays under the block: the plan fact, the allowance comparison, what Pro includes and the notes. */
function UpgradeSupport({ profile, trialDaysLeft, dateHint, showNotes, t }: Readonly<Pick<GuidedPricingSectionProps, 'profile' | 'trialDaysLeft' | 'dateHint' | 't'> & { showNotes: boolean }>) {
  return (
    <div data-upgrade-support="" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs tracking-[0.04em] text-[var(--fg-3)]">{planFactLine(profile, trialDaysLeft, t)}</p>
        {dateHint ? <p className="text-sm leading-[1.55] text-[var(--fg-3)]">{dateHint}</p> : null}
        <p className="t-body max-w-[46ch] text-pretty" style={{ color: 'var(--fg-2)' }}>{t('upgrade.convert.promise')}</p>
        {!profile?.isTrialActive ? <p className="text-sm leading-[1.55] text-[var(--fg-3)]">{t('upgrade.convert.trustLine')}</p> : null}
      </div>
      <AllowanceComparison profile={profile} t={t} />
      <ProBenefits heading t={t} />
      {showNotes ? <div className="flex flex-col items-start gap-2">
        <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">{t('upgrade.convert.cancelAnytime')}</p>
        <p className="max-w-[52ch] text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">{t('upgrade.plans.renewalNote')}</p>
        <p className="max-w-[52ch] text-pretty text-sm leading-[1.55] text-[var(--fg-3)]">{t('upgrade.convert.handOff')}</p>
      </div> : null}
    </div>
  )
}

function orbitLineText(line: ReturnType<typeof resolveUpgradeOrbitLine>, t: UpgradeTranslations): string | null {
  if (!line) return null
  return line.key === 'upgrade.orbitLine.usage' ? t(line.key, { used: line.used, limit: line.limit }) : t(line.key)
}

/** The plan question of the upgrade route: Orbit in Parado with one usage fact, the question, the plan cards as its options and one primary action. */
export function GuidedPricingSection({
  headingId, dateHint, focusOnMount = false, profile, usage, plans, isLoadingPlans, isPlansError, isOnline, trialDaysLeft,
  checkoutLoading, checkoutError, discountedAmount, onCheckout, stayFreeHref = '/profile', onStayFree, onRetryPlans, t,
}: Readonly<GuidedPricingSectionProps>) {
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const wide = useViewportMatch('(min-width: 1024px)')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lineId = useId()
  const { mascotRef, lookAt, lookTowards, lookAway } = useOrbitLook()
  const line = orbitLineText(resolveUpgradeOrbitLine({ isOnline, isLoadingPlans, isPlansError: isPlansError && !plans, usage }), t)
  const announcement = useFlowAnnouncement(line, 'plan')
  const checkoutPending = checkoutLoading !== null
  const selectedName = t(`upgrade.plans.${selectedInterval}.name`)
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [focusOnMount])

  const selectInterval = (interval: string) => {
    if (interval === 'monthly' || interval === 'yearly') setSelectedInterval(interval)
  }
  const primary = (
    <PillButton
      loading={checkoutPending}
      disabled={!plans || !isOnline}
      accessibleName={t(selectedInterval === 'yearly' ? 'upgrade.plans.checkoutLabelRecommended' : 'upgrade.plans.checkoutLabel', { interval: selectedName })}
      onClick={() => onCheckout(selectedInterval)}
    >
      {t('upgrade.plans.cta')}
    </PillButton>
  )

  const checkoutAlert = <p role="alert" className="text-center text-sm leading-[1.55] text-[var(--fg-2)] empty:hidden">{checkoutError}</p>
  const offlineReason = isOnline ? null : <p data-upgrade-offline-reason="" className="text-center text-sm leading-[1.55] text-[var(--fg-2)]">{t('upgrade.billing.offline')}</p>

  return (
    <div className="flex flex-col gap-8">
      <section
        data-upgrade-block=""
        data-orbit-state="parado"
        onFocusCapture={(event) => { if (!(event.target instanceof HTMLHeadingElement)) lookTowards(event.target) }}
        onBlurCapture={lookAway}
        className="mx-auto flex w-full max-w-[592px] flex-col items-center gap-6 text-center"
      >
        <span ref={mascotRef} aria-hidden="true"><OrbitMascot size={wide ? 128 : 96} state="parado" lookAt={lookAt} /></span>
        {line ? <p id={lineId} data-upgrade-orbit-line="" className="text-base leading-6 text-[var(--fg-2)]">{line}</p> : null}
        <h1 id={headingId} ref={headingRef} tabIndex={-1} aria-describedby={line ? lineId : undefined} className="orbit-flow-question text-balance font-display text-[28px] leading-[1.18] text-[var(--fg-1)] lg:text-[34px] lg:leading-[1.15]">{t('upgrade.question')}</h1>
        <div className="flex w-full flex-col items-center gap-3">
          <div className="w-full sm:max-w-[320px]">
            <SegmentedControl
              label={t('upgrade.plans.intervalLabel')}
              options={[
                { value: 'monthly', label: t('upgrade.plans.interval.monthly') },
                { value: 'yearly', label: t('upgrade.plans.interval.annual') },
              ]}
              value={selectedInterval}
              onChange={selectInterval}
              disabled={checkoutPending}
              fullWidth
            />
          </div>
          <PlanOptions plans={plans} isLoading={isLoadingPlans} isError={isPlansError} isOnline={isOnline} selected={selectedInterval}
            disabled={checkoutPending} discountedAmount={discountedAmount} onSelect={setSelectedInterval} onRetry={onRetryPlans} t={t} />
        </div>
        {wide ? <>
          {checkoutAlert}
          <div data-flow-primary="" className="flex w-full justify-center"><div className="w-full max-w-[360px]">{primary}</div></div>
          {offlineReason}
        </> : null}
        <StayFreeLink href={stayFreeHref} disabled={checkoutPending} onStayFree={onStayFree} t={t} />
        <span role="status" aria-live="polite" className="sr-only">{announcement}</span>
      </section>
      <UpgradeSupport profile={profile} trialDaysLeft={trialDaysLeft} dateHint={dateHint} showNotes={Boolean(plans)} t={t} />
      {wide ? null : <div data-flow-primary="" data-flow-footer="" className={PINNED_FOOTER_CLASS}>{checkoutAlert}{offlineReason}{primary}</div>}
    </div>
  )
}
