'use client'

import { useState, useMemo, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import {
  createApiClientError,
  getClientTimeZone,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { API } from '@orbit/shared/api'
import { useProfile, useHasProAccess, useTrialDaysLeft } from '@/hooks/use-profile'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useBilling } from '@/hooks/use-billing'
import { openCustomerPortal } from '@/app/actions/subscription'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'

type SubscriptionInterval = 'monthly' | 'yearly'

export default function UpgradePage() {
  const t = useTranslations()
  const goBackOrFallback = useGoBackOrFallback()
  const locale = useLocale()

  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialDaysLeft = useTrialDaysLeft()
  const { plans, isLoading: isLoadingPlans, isError: isPlansError, refetch: refetchPlans, discountedAmount } = useSubscriptionPlans()

  const isPlaySource = profile?.subscriptionSource === 'play'
  const isBillingEnabled = hasProAccess && !profile?.isTrialActive && !isPlaySource && !profile?.isLifetimePro
  const { billing, isLoading: isBillingLoading, isError: isBillingError, refetch: refetchBilling } = useBilling(isBillingEnabled)

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [portalError, setPortalError] = useState('')

  const usagePercent = useMemo(() => {
    if (!profile || profile.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((profile.aiMessagesUsed / profile.aiMessagesLimit) * 100))
  }, [profile])
  const usageUrgent = usagePercent > 80

  const isManageView = hasProAccess && !profile?.isTrialActive

  const handleCheckout = useCallback(async (interval: SubscriptionInterval) => {
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
        throw createApiClientError(response.status, errorBody, `Failed with status ${response.status}`)
      }
      const data = (await response.json()) as { url?: string }
      if (data.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setCheckoutError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setCheckoutLoading(null)
    }
  }, [t])

  const handleOpenPortal = useCallback(async () => {
    setPortalError('')
    try {
      const data = await openCustomerPortal()
      if (data.url) {
        globalThis.location.href = data.url
      }
    } catch (err: unknown) {
      setPortalError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    }
  }, [t])

  const renderBillingView = () => {
    if (!isManageView) {
      return (
        <PricingSection
          profile={profile ?? null}
          plans={plans}
          isLoadingPlans={isLoadingPlans}
          isPlansError={isPlansError}
          trialDaysLeft={trialDaysLeft}
          checkoutLoading={checkoutLoading}
          checkoutError={checkoutError}
          discountedAmount={discountedAmount}
          onCheckout={(interval) => void handleCheckout(interval)}
          onStayFree={() => goBackOrFallback('/profile')}
          onRetryPlans={() => void refetchPlans()}
          t={t}
        />
      )
    }
    if (isPlaySource) {
      return (
        <PlayBillingDashboard
          profile={profile}
          locale={locale}
          usagePercent={usagePercent}
          usageUrgent={usageUrgent}
          t={t}
        />
      )
    }
    return (
      <BillingDashboard
        billing={billing}
        isBillingLoading={isBillingLoading}
        isBillingError={isBillingError}
        profile={profile ?? null}
        locale={locale}
        usagePercent={usagePercent}
        usageUrgent={usageUrgent}
        portalError={portalError}
        onOpenPortal={() => void handleOpenPortal()}
        onRetryBilling={() => void refetchBilling()}
        t={t}
      />
    )
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <AppBar
          back
          backLabel={t('common.backToProfile')}
          onBack={() => goBackOrFallback('/profile')}
          title={t('upgrade.title')}
        />
        <div className="flex flex-col min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5">
          {renderBillingView()}
        </div>
      </div>
    </div>
  )
}
