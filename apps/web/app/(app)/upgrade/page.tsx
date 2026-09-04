'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useAnimate, useReducedMotion } from 'motion/react'
import { API } from '@orbit/shared/api'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import {
  createApiClientError,
  getClientTimeZone,
  getFriendlyErrorMessage,
  getTrialDaysLeft,
  resolveSubscriptionScreen,
} from '@orbit/shared/utils'
import type { SubscriptionPortalState } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { SubscriptionNotice } from '@/components/upgrade/subscription-notice'
import { openCustomerPortal } from '@/app/actions/subscription'
import { useAppToast } from '@/hooks/use-app-toast'
import { useBilling } from '@/hooks/use-billing'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useOffline } from '@/hooks/use-offline'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'

type SubscriptionInterval = 'monthly' | 'yearly'
const PORTAL_RETURN_KEY = 'orbit.subscription.portal-return'

function UpgradeLoadMotion({
  state,
  children,
}: Readonly<{ state: string; children: ReactNode }>) {
  const prefersReducedMotion = Boolean(useReducedMotion())
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const previousState = useRef(state)

  useEffect(() => {
    const shouldEnter = previousState.current === 'loading' && state !== 'loading'
    previousState.current = state
    if (prefersReducedMotion || !shouldEnter) return

    void animate(scope.current, { opacity: [0, 1] }, {
      duration: motionDurations.base / 1000,
      ease: motionEasings.enter,
    })
  }, [animate, prefersReducedMotion, scope, state])

  return (
    <div
      ref={scope}
      data-motion-purpose="preventing a jarring change"
    >
      {children}
    </div>
  )
}

export default function UpgradePage() {
  const t = useTranslations()
  const locale = useLocale()
  const goBackOrFallback = useGoBackOrFallback()
  const { showSuccess } = useAppToast()
  const { isOnline } = useOffline()
  const {
    status,
    isLoading: isStatusLoading,
    isError: isStatusError,
    refetch: refetchStatus,
  } = useSubscriptionStatus()
  const trialDaysLeft = getTrialDaysLeft(status)
  const {
    plans,
    isLoading: isLoadingPlans,
    isError: isPlansError,
    refetch: refetchPlans,
    discountedAmount,
  } = useSubscriptionPlans()

  const isManageView = Boolean(status?.hasProAccess && !status.isTrialActive)
  const isStripeBilling = isManageView && status?.source !== 'play' && !status?.isLifetimePro
  const {
    billing,
    isLoading: isBillingLoading,
    isError: isBillingError,
    refetch: refetchBilling,
  } = useBilling(isStripeBilling)

  const [checkoutLoading, setCheckoutLoading] = useState<SubscriptionInterval | null>(null)
  const checkoutPendingRef = useRef(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalState, setPortalState] = useState<SubscriptionPortalState>('idle')

  const model = resolveSubscriptionScreen({
    status,
    isStatusLoading,
    isStatusError,
    isBillingLoading,
    isBillingError,
    billingStatus: billing?.status,
    cancelAtPeriodEnd: billing?.cancelAtPeriodEnd,
    isOnline,
    portalState,
  })

  const usagePercent = useMemo(() => {
    if (!status || status.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((status.aiMessagesUsed / status.aiMessagesLimit) * 100))
  }, [status])

  useEffect(() => {
    if (globalThis.sessionStorage.getItem(PORTAL_RETURN_KEY) !== '1') return
    globalThis.sessionStorage.removeItem(PORTAL_RETURN_KEY)
    void Promise.all([refetchStatus(), refetchBilling()]).then(() => {
      showSuccess(t('upgrade.billing.portalReturned'))
    })
  }, [refetchBilling, refetchStatus, showSuccess, t])

  const handleCheckout = useCallback(
    async (interval: SubscriptionInterval) => {
      if (checkoutPendingRef.current || !isOnline) return
      checkoutPendingRef.current = true
      setCheckoutLoading(interval)
      setCheckoutError('')
      try {
        const timeZone = getClientTimeZone()
        const checkoutUrl = timeZone
          ? `${API.subscription.checkout}?timeZone=${encodeURIComponent(timeZone)}`
          : API.subscription.checkout
        const response = await fetch(checkoutUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interval }),
        })
        if (!response.ok) {
          const errorBody: unknown = await response.json().catch(() => null)
          throw createApiClientError(
            response.status,
            errorBody,
            `Failed with status ${response.status}`,
          )
        }
        const data = (await response.json()) as { url?: string }
        if (data.url) globalThis.location.href = data.url
      } catch (error: unknown) {
        setCheckoutError(getFriendlyErrorMessage(error, t, 'auth.genericError', 'generic'))
      } finally {
        checkoutPendingRef.current = false
        setCheckoutLoading(null)
      }
    },
    [isOnline, t],
  )

  const handleOpenPortal = useCallback(async () => {
    if (!isOnline) return
    setPortalState('opening')
    try {
      const data = await openCustomerPortal()
      globalThis.sessionStorage.setItem(PORTAL_RETURN_KEY, '1')
      globalThis.location.href = data.url
    } catch {
      setPortalState('failed')
    }
  }, [isOnline])

  const retryLoad = () => {
    void Promise.all([refetchStatus(), refetchBilling(), refetchPlans()])
  }

  let content
  if (model.state === 'loading') {
    content = (
      <div className="flex flex-col gap-3">
        <Skeleton variant="settings" label={t('common.loading')} />
        <Skeleton variant="settings" label={t('common.loading')} />
        <Skeleton variant="settings" label={t('common.loading')} />
      </div>
    )
  } else if (model.state === 'load-failed') {
    content = (
      <ErrorState
        message={t('upgrade.billing.error')}
        action={
          <PillButton variant="ghost" onClick={retryLoad}>
            {t('upgrade.billing.retry')}
          </PillButton>
        }
      />
    )
  } else if (model.content === 'pitch') {
    content = (
      <div className="flex flex-col gap-6">
        <SubscriptionNotice status={status} locale={locale} t={t} />
        <PricingSection
          profile={status}
          plans={plans}
          isLoadingPlans={isLoadingPlans}
          isPlansError={isPlansError}
          isOnline={isOnline}
          trialDaysLeft={trialDaysLeft}
          checkoutLoading={checkoutLoading}
          checkoutError={checkoutError}
          discountedAmount={discountedAmount}
          onCheckout={(interval) => void handleCheckout(interval)}
          onStayFree={() => goBackOrFallback('/profile')}
          onRetryPlans={() => void refetchPlans()}
          t={t}
        />
      </div>
    )
  } else if (model.content === 'play') {
    content = (
      <div className="flex flex-col gap-6">
        <SubscriptionNotice status={status} locale={locale} t={t} />
        <PlayBillingDashboard
          state={model.state}
          status={status}
          locale={locale}
          usagePercent={usagePercent}
          usageUrgent={usagePercent >= 80}
          t={t}
        />
      </div>
    )
  } else {
    content = (
      <div className="flex flex-col gap-6">
        <SubscriptionNotice status={status} locale={locale} t={t} />
        <BillingDashboard
          state={model.state}
          billing={billing}
          status={status}
          locale={locale}
          usagePercent={usagePercent}
          usageUrgent={usagePercent >= 80}
          onOpenPortal={() => void handleOpenPortal()}
          onRetryPortal={() => void handleOpenPortal()}
          t={t}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('upgrade.title')}
      />
      <main className="mx-auto w-full max-w-[620px] flex-1 px-4 py-6">
        {model.state === 'offline' ? <ErrorState message={t('upgrade.billing.offline')} /> : null}
        <UpgradeLoadMotion state={model.state}>
          {content}
        </UpgradeLoadMotion>
      </main>
    </div>
  )
}
