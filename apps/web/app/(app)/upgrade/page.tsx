'use client'

import { fetchWithThrottle } from '@/lib/throttle-fetch'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { API } from '@orbit/shared/api'
import {
  createApiClientError,
  getClientTimeZone,
  getFriendlyErrorMessage,
  getTrialDaysLeft,
  resolveSubscriptionScreen,
  playManageSubscriptionUrl,
} from '@orbit/shared/utils'
import type { SubscriptionPortalState } from '@orbit/shared/utils'
import { AppBar } from '@/components/ui/app-bar'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { UsageStats } from '@/components/upgrade/usage-stats'
import { SubscriptionNotice } from '@/components/upgrade/subscription-notice'
import { openCustomerPortal } from '@/lib/actions/subscription'
import { useAppToast } from '@/hooks/use-app-toast'
import { useBilling } from '@/hooks/use-billing'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useOffline } from '@/hooks/use-offline'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { getHeldAccountId, useHeldAccountId } from '@/stores/auth-store'

type SubscriptionInterval = 'monthly' | 'yearly'
const PORTAL_RETURN_KEY = 'orbit.subscription.portal-return'

export default function UpgradePage() {
  const t = useTranslations()
  const locale = useLocale()
  const goBackOrFallback = useGoBackOrFallback()
  const { showSuccess } = useAppToast()
  const { isOnline } = useOffline()
  const heldAccountId = useHeldAccountId()
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

  const [checkoutLoading, setCheckoutLoading] = useAccountScopedState<SubscriptionInterval | null>(null)
  const checkoutPendingRef = useRef<number | null>(null)
  const [checkoutError, setCheckoutError] = useAccountScopedState('')
  const [showPitch, setShowPitch] = useAccountScopedState(false)
  const [portalState, setPortalState] = useAccountScopedState<SubscriptionPortalState>('idle')

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
  const screenState = heldAccountId === null ? 'loading' : model.state

  const usagePercent = useMemo(() => {
    if (!status || status.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((status.aiMessagesUsed / status.aiMessagesLimit) * 100))
  }, [status])

  useEffect(() => {
    const refreshAfterPortal = () => {
      const portalOwner = globalThis.sessionStorage.getItem(PORTAL_RETURN_KEY)
      if (portalOwner === null || heldAccountId === null) return
      const portalAccount = getAccountGeneration()
      globalThis.sessionStorage.removeItem(PORTAL_RETURN_KEY)
      if (portalOwner !== heldAccountId) return
      setPortalState('idle')
      void Promise.all([refetchStatus(), refetchBilling()]).then(() => {
        if (getAccountGeneration() === portalAccount) showSuccess(t('upgrade.billing.portalReturned'))
      })
    }
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refreshAfterPortal()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshAfterPortal()
    }
    globalThis.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    if (portalState !== 'opening') refreshAfterPortal()
    return () => {
      globalThis.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [heldAccountId, portalState, refetchBilling, refetchStatus, setPortalState, showSuccess, t])

  const handleCheckout = useCallback(
    async (interval: SubscriptionInterval) => {
      const checkoutAccount = getAccountGeneration()
      const checkoutOwner = getHeldAccountId()
      if (checkoutPendingRef.current === checkoutAccount || !isOnline || checkoutOwner === null) return
      checkoutPendingRef.current = checkoutAccount
      setCheckoutLoading(interval)
      setCheckoutError('')
      try {
        const timeZone = getClientTimeZone()
        const checkoutUrl = timeZone
          ? `${API.subscription.checkout}?timeZone=${encodeURIComponent(timeZone)}`
          : API.subscription.checkout
        const response = await fetchWithThrottle(checkoutUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Orbit-Held-Account-Id': checkoutOwner,
          },
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
        /**
         * The tab may hold another account by now. A checkout session belongs to the account that
         * opened it, so following its url would bill the wrong person, and reporting its failure
         * would alarm someone who never pressed the button.
         */
        if (getAccountGeneration() !== checkoutAccount) return
        if (data.url) globalThis.location.href = data.url
      } catch (error: unknown) {
        if (getAccountGeneration() !== checkoutAccount) return
        setCheckoutError(getFriendlyErrorMessage(error, t, 'auth.genericError', 'generic'))
      } finally {
        if (checkoutPendingRef.current === checkoutAccount) {
          checkoutPendingRef.current = null
          setCheckoutLoading(null)
        }
      }
    },
    [isOnline, setCheckoutError, setCheckoutLoading, t],
  )

  const handleOpenPortal = useCallback(async () => {
    const portalOwner = getHeldAccountId()
    if (!isOnline || portalOwner === null) return
    const portalAccount = getAccountGeneration()
    setPortalState('opening')
    try {
      if (status?.source === 'play') {
        globalThis.sessionStorage.setItem(PORTAL_RETURN_KEY, portalOwner)
        globalThis.location.href = playManageSubscriptionUrl()
        return
      }
      const data = await openCustomerPortal()
      if (getAccountGeneration() !== portalAccount) return
      globalThis.sessionStorage.setItem(PORTAL_RETURN_KEY, portalOwner)
      globalThis.location.href = data.url
    } catch {
      if (getAccountGeneration() !== portalAccount) return
      setPortalState('failed')
    }
  }, [isOnline, setPortalState, status])

  const retryLoad = () => {
    void Promise.all([refetchStatus(), refetchBilling(), refetchPlans()])
  }

  let content
  if (screenState === 'loading') {
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
  } else if (!status?.hasProAccess && (status?.lapseReason || status?.subscriptionEndedAtUtc) && !showPitch) {
    content = <SubscriptionNotice status={status} locale={locale} onResubscribe={() => setShowPitch(true)} t={t} />
  } else if (model.content === 'pitch') {
    content = (
      <div className="flex flex-col gap-6">
        <PricingSection
          focusOnMount={showPitch}
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
        {status ? <UsageStats usagePercent={usagePercent} usageUrgent={usagePercent >= 80} profile={status} t={t} /> : null}
      </div>
    )
  } else if (model.content === 'play') {
    content = (
      <div className="flex flex-col gap-6">
        <PlayBillingDashboard
          state={model.state}
          onManagePlay={() => void handleOpenPortal()}
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
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('upgrade.title')}
      />
      <main className="mx-auto w-full max-w-[620px] flex-1 px-4 py-4" data-state={screenState} aria-busy={screenState === 'loading'}>
        {screenState === 'offline' && model.content === 'pitch' ? <ErrorState message={t('upgrade.billing.offline')} /> : null}
        {content}
      </main>
    </div>
  )
}
