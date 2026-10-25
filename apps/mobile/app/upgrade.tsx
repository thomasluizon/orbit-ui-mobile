import { SPACING, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'
import { useContentFrameStyle } from '@/hooks/use-content-frame-style'
import { getProfileTrialEndHint } from '@orbit/shared/utils/profile-navigation'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import Constants from 'expo-constants'
import { showManageSubscriptionsIOS } from 'expo-iap'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { SubscriptionStatus } from '@orbit/shared/types/profile'
import { API } from '@orbit/shared/api'
import {
  getTrialDaysLeft,
  getSubscriptionBillingProvider,
  shouldFetchStripeBilling,
  playManageSubscriptionUrl,
  resolveSubscriptionScreen,
  resolveUpgradeHeader,
} from '@orbit/shared/utils'
import type {
  SubscriptionPortalState,
  SubscriptionScreenContent,
  SubscriptionScreenState,
} from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useBilling } from '@/hooks/use-billing'
import { useStoreBilling } from '@/hooks/store-billing-provider'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useSubscriptionStatus } from '@/hooks/use-subscription-status'
import { createTokensV2 } from '@/lib/theme'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { PillButton } from '@/components/ui/pill-button'
import { useBackLabel } from '@/hooks/use-back-label'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { getUpgradeFallbackRoute } from '@/lib/upgrade-route'
import { PageHeader } from '@/components/ui/page-header'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { SubscriptionNotice } from '@/components/upgrade/subscription-notice'
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
    body = <View style={styles.padBlock}><ErrorState message={t('upgrade.billing.error')} action={
      <PillButton variant="ghost" onClick={onRetry}>{t('upgrade.billing.retry')}</PillButton>
    } /></View>
  } else {
    body = content === 'pitch' ? pitchContent : billingContent
  }

  return (
    <>
      {state === 'offline' && content === 'pitch' ? <View style={styles.padBlock}><ErrorState message={t('upgrade.billing.offline')} /></View> : null}
      {body}
    </>
  )
}

function upgradeContentCap(state: SubscriptionScreenState, content: SubscriptionScreenContent, hasLapsedNotice: boolean): 560 | 620 {
  const isPitch = state !== 'loading' && state !== 'load-failed' && !hasLapsedNotice && content === 'pitch'
  return isPitch ? 620 : 560
}

function usesNativeBillingDashboard(content: SubscriptionScreenContent, isApple: boolean): boolean {
  return isApple || content === 'play' || content === 'app_store'
}

function nativePlanPrice(status: SubscriptionStatus | null, monthlyPrice?: string, yearlyPrice?: string): string | undefined {
  if (!status || status.isLifetimePro) return undefined
  const provider = getSubscriptionBillingProvider(status)
  const nativeProvider = Platform.OS === 'ios' ? 'app_store' : 'play'
  if (provider !== nativeProvider) return undefined
  return status.subscriptionInterval === 'yearly' ? yearlyPrice : monthlyPrice
}

export default function UpgradeScreen() {
  const clearance = useShellScrollerClearance()
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
  const playBilling = useStoreBilling({
    preferReferralOffer: !!plans?.couponPercentOff,
    onPurchased: () => showSuccess(t('upgrade.purchaseSuccess')),
  })
  const provider = getSubscriptionBillingProvider(status)
  const isApple = Platform.OS === 'ios'
  const {
    billing,
    isLoading: isBillingLoading,
    isError: isBillingError,
    refetch: refetchBilling,
  } = useBilling(shouldFetchStripeBilling(status, Platform.OS))
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutLoading, setCheckoutLoading] = useState<SubscriptionInterval | null>(null)
  const [showPitch, setShowPitch] = useState(false)
  const [portalState, setPortalState] = useState<SubscriptionPortalState>('idle')
  const returningFromBillingRef = useRef(false)
  const [prevProcessing, setPrevProcessing] = useState(false)
  const fallbackRoute = getUpgradeFallbackRoute(from, '/profile')
  const backLabel = useBackLabel(typeof fallbackRoute === 'string' ? fallbackRoute : fallbackRoute.pathname)

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
    canUseStripeBilling: !isApple,
    billingStatus: billing?.status,
    cancelAtPeriodEnd: billing?.cancelAtPeriodEnd,
    isOnline,
    portalState,
  })
  const { lapsedNoticeStatus, titleKey } = resolveUpgradeHeader(status, model, showPitch)
  const contentFrameStyle = useContentFrameStyle(upgradeContentCap(model.state, model.content, Boolean(lapsedNoticeStatus)))

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !returningFromBillingRef.current) return
      returningFromBillingRef.current = false
      setPortalState('idle')
      void Promise.all([refetchStatus(), refetchBilling()]).then(() => {
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
    const packageName = Constants.expoConfig?.android?.package
    if (!packageName) {
      setPortalState('failed')
      return
    }
    setPortalState('opening')
    returningFromBillingRef.current = true
    Linking.openURL(playManageSubscriptionUrl(packageName))
      .catch(() => {
        returningFromBillingRef.current = false
        setPortalState('failed')
      })
  }

  async function handleManageApple() {
    if (!isOnline) return
    setPortalState('opening')
    try {
      await showManageSubscriptionsIOS()
      await refetchStatus()
      setPortalState('idle')
    } catch { setPortalState('failed') }
  }

  async function handlePortal() {
    if (!isOnline || isApple) return

    setPortalState('opening')
    try {
      const res = await apiClient<{ url: string }>(API.subscription.portal, {
        method: 'POST',
      })
      returningFromBillingRef.current = true
      await Linking.openURL(res.url)
    } catch {
      returningFromBillingRef.current = false
      setPortalState('failed')
    }
  }

  function handleManageNativeStore() {
    if (isApple) void handleManageApple()
    else handleManagePlay()
  }

  const billingDashboard = usesNativeBillingDashboard(model.content, isApple) ? (
    <PlayBillingDashboard
      status={status}
      provider={provider}
      displayPrice={nativePlanPrice(status, playBilling.monthlyOffer?.displayPrice, playBilling.yearlyOffer?.displayPrice)}
      locale={locale}
      usagePercent={usagePercent}
      usageProfile={usageProfile}
      portalState={portalState}
      isOnline={isOnline}
      onManagePlay={handleManageNativeStore}
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

  const pitchContent = lapsedNoticeStatus ? (
    <SubscriptionNotice status={lapsedNoticeStatus} locale={locale} onResubscribe={() => setShowPitch(true)} t={t} tokens={tokens} />
  ) : (
    <View style={{ gap: 24 }}>
      <PricingSection
        inset={false}
        focusOnMount={showPitch}
        profile={status}
        plans={plans}
        isLoadingPlans={isLoadingPlans}
        isPlansError={isPlansError}
        isLoadingProducts={playBilling.isLoadingProducts}
        isProductsError={playBilling.isProductsError}
        isOnline={isOnline}
        dateHint={getProfileTrialEndHint(status, locale, t)}
        trialDaysLeft={trialDaysLeft}
        selectedInterval={selectedInterval}
        onSelectInterval={setSelectedInterval}
        onStayFree={() => goBackOrFallback(fallbackRoute)}
        monthlyOffer={playBilling.monthlyOffer}
        yearlyOffer={playBilling.yearlyOffer}
        monthlyDisplayPrice={playBilling.monthlyOffer?.displayPrice}
        yearlyDisplayPrice={playBilling.yearlyOffer?.displayPrice}
        checkoutLoading={checkoutLoading}
        checkoutError={checkoutError}
        checkoutDisabled={!isOnline}
        onCheckout={handleCheckout}
        isRestoring={playBilling.isRestoring}
        onRestore={() => { if (isOnline) void playBilling.restorePurchases() }}
        onRetryPlans={() => { if (isOnline) { playBilling.retryProducts(); refetchPlans().catch(() => {}) } }}
        t={t}
        tokens={tokens}
      />
    </View>
  )

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: tokens.bg }]}
      edges={['top', 'bottom']}
    >
      <PageHeader
        onBack={() => goBackOrFallback(fallbackRoute)}
        title={titleKey ? t(titleKey) : ''}
        backLabel={backLabel}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, clearance > 0 ? { paddingBottom: clearance } : undefined]}
        showsVerticalScrollIndicator={false}
      >
        <View style={contentFrameStyle}>
          <UpgradeContent
            state={model.state}
            content={model.content}
            billingContent={billingDashboard}
            pitchContent={pitchContent}
            onRetry={() => { void Promise.all([refetchStatus(), refetchBilling(), refetchPlans()]) }}
            t={t}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: SPACING.s16,
    paddingBottom: SPACING.s32,
  },
  padBlock: {
    paddingVertical: SPACING.s16,
    gap: 8,
    alignItems: 'stretch',
  },
})
