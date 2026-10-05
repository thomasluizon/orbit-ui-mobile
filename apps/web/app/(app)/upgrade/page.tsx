'use client'

import { getProfileTrialEndHint } from '@orbit/shared/utils/profile-navigation'

import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useDocumentTitle } from '@/hooks/use-document-title'
import {
  getTrialDaysLeft,
  resolveSubscriptionScreen,
  resolveUpgradeHeader,
  playManageSubscriptionUrl,
} from '@orbit/shared/utils'
import type { SubscriptionPortalState } from '@orbit/shared/utils'
import { PageHeader } from '@/components/ui/page-header'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { SubscriptionNotice } from '@/components/upgrade/subscription-notice'
import { openCustomerPortal } from '@/lib/actions/subscription'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppToast } from '@/hooks/use-app-toast'
import { useStripeCheckout } from '@/hooks/use-stripe-checkout'
import { useStripeCheckoutReturn } from '@/hooks/use-stripe-checkout-return'
import { useBilling } from '@/hooks/use-billing'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useOffline } from '@/hooks/use-offline'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useHeldAccountId } from '@/stores/auth-store'


const PORTAL_RETURN_KEY = 'orbit.subscription.portal-return'

export default function UpgradePage() {
  const t = useTranslations()
  const locale = useLocale()
  const from = useSearchParams().get('from')
  const fallbackRoute = from === '/profile/astra' ? from : '/profile'
  const goBackOrFallback = useGoBackOrFallback()
  const { showSuccess, showPersistentError } = useAppToast()
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

  const { checkout: handleCheckout, checkoutLoading, checkoutError } = useStripeCheckout()
  const { hasReturnError, isSettling, retryReturn } = useStripeCheckoutReturn()
  const [showPitch, setShowPitch] = useAccountScopedState(false)
  const [portalState, setPortalState] = useAccountScopedState<SubscriptionPortalState>('idle')

  const model = resolveSubscriptionScreen({
    status,
    isStatusLoading,
    isStatusError: isStatusError || hasReturnError,
    isBillingLoading,
    isBillingError,
    billingStatus: billing?.status,
    cancelAtPeriodEnd: billing?.cancelAtPeriodEnd,
    isOnline,
    portalState,
  })
  const screenState = heldAccountId === null ? 'loading' : model.state
  const { lapsedNoticeStatus, titleKey } = resolveUpgradeHeader(status, model, showPitch, heldAccountId !== null)
  useDocumentTitle(t(titleKey ?? 'upgrade.pitchTitle'))

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

  const handleOpenPortal = useCallback(async () => {
    const intendedAccountId = getHeldAccountId()
    if (!isOnline || intendedAccountId === null) return
    const accountGeneration = getAccountGeneration()

    setPortalState('opening')
    try {
      if (status?.source === 'play') {
        const packageName = process.env.NEXT_PUBLIC_PLAY_PACKAGE_NAME
        if (!packageName) throw new Error('Missing NEXT_PUBLIC_PLAY_PACKAGE_NAME')
        globalThis.sessionStorage.setItem(PORTAL_RETURN_KEY, intendedAccountId)
        globalThis.location.href = playManageSubscriptionUrl(packageName)
        return
      }
      const data = await openCustomerPortal(intendedAccountId)
      if (getHeldAccountId() !== intendedAccountId || getAccountGeneration() !== accountGeneration) {
        setPortalState('idle')
        showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
        return
      }
      globalThis.sessionStorage.setItem(PORTAL_RETURN_KEY, intendedAccountId)
    globalThis.location.href = data.url
    } catch (error) {
      if (getAccountGeneration() !== accountGeneration) return
      if (reportsAccountChanged(error)) {
        setPortalState('idle')
        showPersistentError(t('errors.api.accountChanged'), t('errorScreen.reload'))
        return
      }
      setPortalState('failed')
    }
  }, [isOnline, setPortalState, showPersistentError, status, t])


  const retryLoad = () => {
    if (hasReturnError) { retryReturn(); return }
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
  } else if (screenState === 'load-failed') {
    content = (
      <ErrorState
        message={t('upgrade.billing.error')}
        action={
          <PillButton variant="ghost" loading={isSettling} onClick={retryLoad}>
            {t('upgrade.billing.retry')}
          </PillButton>
        }
      />
    )
  } else if (lapsedNoticeStatus) {
    content = <SubscriptionNotice status={lapsedNoticeStatus} locale={locale} onResubscribe={() => setShowPitch(true)} t={t} />
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
          dateHint={getProfileTrialEndHint(status, locale, t)}
          trialDaysLeft={trialDaysLeft}
          checkoutLoading={checkoutLoading}
          checkoutError={checkoutError}
          discountedAmount={discountedAmount}
          onCheckout={(interval) => void handleCheckout(interval)}
          stayFreeHref={fallbackRoute}
          onStayFree={() => goBackOrFallback(fallbackRoute)}
          onRetryPlans={() => void refetchPlans()}
          t={t}
        />
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
    <div className="flex flex-col">
      <PageHeader
        backLabel={fallbackRoute === '/profile/astra' ? t('common.backToDestination', { destination: t('profile.groups.astra') }) : t('common.backToProfile')}
        onBack={() => goBackOrFallback(fallbackRoute)}
        title={titleKey ? t(titleKey) : ''}
        titleTranslate={titleKey === 'upgrade.pitchTitle' ? 'no' : undefined}
      />
      <div data-upgrade-screen="" className="mx-auto w-full max-w-[652px] flex-1 px-4 pt-4" data-state={screenState} aria-busy={screenState === 'loading'}>
        {screenState === 'offline' && model.content === 'pitch' ? <ErrorState message={t('upgrade.billing.offline')} /> : null}
        {content}
      </div>
    </div>
  )
}
