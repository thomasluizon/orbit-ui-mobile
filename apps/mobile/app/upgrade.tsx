import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { API } from '@orbit/shared/api'
import {
  getTrialDaysLeft,
  playManageSubscriptionUrl,
  resolveSubscriptionScreen,
} from '@orbit/shared/utils'
import type {
  SubscriptionPortalState,
  SubscriptionScreenContent,
  SubscriptionScreenState,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useBilling } from '@/hooks/use-billing'
import { usePlayBilling } from '@/hooks/use-play-billing'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { getUpgradeFallbackRoute } from '@/lib/upgrade-route'
import { AppBar } from '@/components/ui/app-bar'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PitchSubscriptionCard } from '@/components/upgrade/pitch-subscription-card'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import type { SubscriptionInterval, UpgradeTextFn } from '@/components/upgrade/types'
import { useAppToast } from '@/hooks/use-app-toast'

function UpgradeContent({
  state,
  content,
  billingContent,
  pitchContent,
  onRetry,
  t,
}: Readonly<{
  state: SubscriptionScreenState
  content: SubscriptionScreenContent
  billingContent: ReactNode
  pitchContent: ReactNode
  onRetry: () => void
  t: UpgradeTextFn
}>) {
  let body = pitchContent
  if (state === 'loading') {
    body = (
      <View style={styles.padBlock}>
        <Skeleton variant="settings" label={t('common.loading')} />
        <Skeleton variant="settings" label={t('common.loading')} />
        <Skeleton variant="settings" label={t('common.loading')} />
      </View>
    )
  } else if (state === 'load-failed') {
    body = <ErrorState message={t('upgrade.billing.error')} action={
      <PillButton variant="ghost" onClick={onRetry}>{t('upgrade.billing.retry')}</PillButton>
    } />
  } else {
    body = content === 'pitch' ? pitchContent : billingContent
  }

  return (
    <>
      {state === 'offline' ? <View style={styles.padBlock}><ErrorState message={t('upgrade.billing.offline')} /></View> : null}
      {body}
    </>
  )
}

export default function UpgradeScreen() {
  const { from } = useLocalSearchParams<{ from?: string | string[] }>()
  const goBackOrFallback = useGoBackOrFallback()
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const { isOnline } = useOffline()
  const { showSuccess } = useAppToast()
  const locale = i18n.language
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
  } = useSubscriptionPlans()
  const playBilling = usePlayBilling({
    preferReferralOffer: !!plans?.couponPercentOff,
  })
  const isPlaySource = status?.source === 'play'
  const showBilling = Boolean(status?.hasProAccess && !status.isTrialActive)
  const {
    billing,
    isLoading: isBillingLoading,
    isError: isBillingError,
    refetch: refetchBilling,
  } = useBilling(showBilling && !isPlaySource && !status?.isLifetimePro)
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutLoading, setCheckoutLoading] = useState<SubscriptionInterval | null>(null)
  const [portalState, setPortalState] = useState<SubscriptionPortalState>('idle')
  const returningFromBillingRef = useRef(false)
  const [prevProcessing, setPrevProcessing] = useState(false)
  const fallbackRoute = getUpgradeFallbackRoute(from, '/profile')

  if (prevProcessing !== playBilling.isProcessing) {
    setPrevProcessing(playBilling.isProcessing)
    if (!playBilling.isProcessing) setCheckoutLoading(null)
  }

  const checkoutError = playBilling.errorKey ? t(playBilling.errorKey) : ''

  const usagePercent = useMemo(() => {
    if (!status || status.aiMessagesLimit === 0) return 0
    return Math.min(100, Math.round((status.aiMessagesUsed / status.aiMessagesLimit) * 100))
  }, [status])

  const usageProfile = status
    ? {
        aiMessagesUsed: status.aiMessagesUsed,
        aiMessagesLimit: status.aiMessagesLimit,
      }
    : null

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

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !returningFromBillingRef.current) return
      returningFromBillingRef.current = false
      void Promise.all([refetchStatus(), refetchBilling()]).then(() => {
        setPortalState('idle')
        showSuccess(t('upgrade.billing.portalReturned'))
      })
    })
    return () => subscription.remove()
  }, [refetchBilling, refetchStatus, showSuccess, t])

  function handleCheckout(interval: SubscriptionInterval) {
    playBilling.clearError()
    setCheckoutLoading(interval)
    void playBilling.purchase(interval)
  }

  function handleManagePlay() {
    if (!isOnline) return
    setPortalState('opening')
    Linking.openURL(playManageSubscriptionUrl())
      .then(() => {
        returningFromBillingRef.current = true
      })
      .catch(() => setPortalState('failed'))
  }

  async function handlePortal() {
    if (!isOnline) {
      return
    }

    setPortalState('opening')
    try {
      const res = await apiClient<{ url: string }>(API.subscription.portal, {
        method: 'POST',
      })
      await Linking.openURL(res.url)
      returningFromBillingRef.current = true
    } catch {
      setPortalState('failed')
    }
  }

  const billingDashboard = model.content === 'play' ? (
    <PlayBillingDashboard
      status={status}
      displayPrice={
        status?.subscriptionInterval === 'yearly'
          ? playBilling.yearlyOffer?.displayPrice
          : playBilling.monthlyOffer?.displayPrice
      }
      locale={locale}
      usagePercent={usagePercent}
      usageProfile={usageProfile}
      portalState={portalState}
      isOnline={isOnline}
      onManagePlay={handleManagePlay}
      t={t}
      tokens={tokens}
    />
  ) : (
    <BillingDashboard
      state={model.state}
      data={billing}
      isOnline={isOnline}
      locale={locale}
      usagePercent={usagePercent}
      usageProfile={usageProfile}
      status={status}
      onPortal={() => void handlePortal()}
      onRetryPortal={() => void handlePortal()}
      t={t}
      tokens={tokens}
    />
  )

  const pitchContent = (
    <>
      {status ? <PitchSubscriptionCard status={status} locale={locale} t={t} tokens={tokens} /> : null}
      <PricingSection
        profile={status}
        plans={plans}
        isLoadingPlans={isLoadingPlans}
        isPlansError={isPlansError}
        isOnline={isOnline}
        trialDaysLeft={trialDaysLeft}
        selectedInterval={selectedInterval}
        onSelectInterval={setSelectedInterval}
        onStayFree={() => goBackOrFallback(fallbackRoute)}
        yearlyOffer={playBilling.yearlyOffer}
        monthlyDisplayPrice={playBilling.monthlyOffer?.displayPrice}
        yearlyDisplayPrice={playBilling.yearlyOffer?.displayPrice}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        checkoutDisabled={!isOnline}
        onCheckout={handleCheckout}
        isRestoring={playBilling.isRestoring}
        onRestore={() => { if (isOnline) void playBilling.restorePurchases() }}
        onRetryPlans={() => { if (isOnline) refetchPlans().catch(() => {}) }}
        t={t}
        tokens={tokens}
      />
    </>
  )

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: tokens.bg }]}
      edges={['top', 'bottom']}
    >
      <AppBar
        back
        onBack={() => goBackOrFallback(fallbackRoute)}
        title={t('upgrade.title')}
        backLabel={t('common.goBack')}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <UpgradeContent
          state={model.state}
          content={model.content}
          billingContent={billingDashboard}
          pitchContent={pitchContent}
          onRetry={() => { void Promise.all([refetchStatus(), refetchBilling(), refetchPlans()]) }}
          t={t}
        />

        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  bottomSpace: { height: 24 },
  padBlock: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
    alignItems: 'center',
  },
})
