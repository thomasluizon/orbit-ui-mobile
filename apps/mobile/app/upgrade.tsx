import { useMemo, useState } from 'react'
import {
  Linking,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { SafeAreaView } from 'react-native-safe-area-context'
import { API } from '@orbit/shared/api'
import { getFriendlyErrorMessage, playManageSubscriptionUrl } from '@orbit/shared/utils'
import { apiClient } from '@/lib/api-client'
import { useBilling } from '@/hooks/use-billing'
import { usePlayBilling } from '@/hooks/use-play-billing'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import {
  useHasProAccess,
  useProfile,
  useTrialDaysLeft,
  useTrialExpired,
  useTrialUrgent,
} from '@/hooks/use-profile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useOffline } from '@/hooks/use-offline'
import { OfflineUnavailableState } from '@/components/ui/offline-unavailable-state'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { getUpgradeFallbackRoute } from '@/lib/upgrade-route'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { BillingDashboard } from '@/components/upgrade/billing-dashboard'
import { PlayBillingDashboard } from '@/components/upgrade/play-billing-dashboard'
import { PricingSection } from '@/components/upgrade/pricing-section'
import type { SubscriptionInterval } from '@/components/upgrade/types'

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
  const locale = i18n.language
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const trialExpired = useTrialExpired()
  const trialDaysLeft = useTrialDaysLeft()
  const trialUrgent = useTrialUrgent()
  const {
    plans,
    isLoading: isLoadingPlans,
    isError: isPlansError,
    refetch: refetchPlans,
  } = useSubscriptionPlans()
  const playBilling = usePlayBilling({ preferReferralOffer: !!plans?.couponPercentOff })
  const isPlaySource = profile?.subscriptionSource === 'play'
  const showBilling = hasProAccess && !profile?.isTrialActive
  const {
    billing,
    isLoading: isBillingLoading,
    isError: isBillingError,
    refetch: refetchBilling,
  } = useBilling(showBilling && !isPlaySource && !profile?.isLifetimePro)
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutLoading, setCheckoutLoading] = useState<SubscriptionInterval | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState('')
  const [prevProcessing, setPrevProcessing] = useState(false)
  const fallbackRoute = getUpgradeFallbackRoute(from, '/profile')

  if (prevProcessing !== playBilling.isProcessing) {
    setPrevProcessing(playBilling.isProcessing)
    if (!playBilling.isProcessing) setCheckoutLoading(null)
  }

  const checkoutError = playBilling.errorKey ? t(playBilling.errorKey) : ''

  const usagePercent = useMemo(() => {
    if (!profile || profile.aiMessagesLimit === 0) return 0
    return Math.min(
      100,
      Math.round((profile.aiMessagesUsed / profile.aiMessagesLimit) * 100),
    )
  }, [profile])

  const usageProfile = profile
    ? {
        aiMessagesUsed: profile.aiMessagesUsed,
        aiMessagesLimit: profile.aiMessagesLimit,
      }
    : null

  const showsProPanel =
    showBilling && !isPlaySource && !billing && !isBillingLoading && !isBillingError
  const showGradient = !showBilling || showsProPanel

  function handleCheckout(interval: SubscriptionInterval) {
    if (!isOnline) return
    playBilling.clearError()
    setCheckoutLoading(interval)
    void playBilling.purchase(interval)
  }

  function handleManagePlay() {
    setPortalError('')
    Linking.openURL(playManageSubscriptionUrl()).catch((err: unknown) =>
      setPortalError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic')),
    )
  }

  async function handlePortal() {
    if (!isOnline) {
      setPortalError(t('offline.title'))
      return
    }

    setPortalLoading(true)
    setPortalError('')
    try {
      const res = await apiClient<{ url?: string }>(API.subscription.portal, {
        method: 'POST',
      })
      if (res.url) await Linking.openURL(res.url)
    } catch (err: unknown) {
      setPortalError(getFriendlyErrorMessage(err, t, 'auth.genericError', 'generic'))
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: tokens.bg }]}
      edges={['top']}
    >
      {showGradient ? <GradientTop height={260} /> : null}
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
        {!isOnline ? (
          <View style={styles.padBlock}>
            <OfflineUnavailableState
              title={t('offline.title')}
              description={t('offline.description')}
              compact
            />
          </View>
        ) : null}

        {showBilling ? (
          isPlaySource ? (
            <PlayBillingDashboard
              profile={profile ?? null}
              locale={locale}
              usagePercent={usagePercent}
              usageProfile={usageProfile}
              portalError={portalError}
              onManagePlay={handleManagePlay}
              t={t}
              tokens={tokens}
            />
          ) : (
            <BillingDashboard
              data={billing}
              isBillingLoading={isBillingLoading}
              isBillingError={isBillingError}
              isOnline={isOnline}
              locale={locale}
              usagePercent={usagePercent}
              usageProfile={usageProfile}
              profile={profile ?? null}
              portalLoading={portalLoading}
              portalError={portalError}
              onPortal={handlePortal}
              onRetryBilling={() => {
                refetchBilling().catch(() => {})
              }}
              t={t}
              tokens={tokens}
            />
          )
        ) : (
          <PricingSection
            profile={profile ?? null}
            plans={plans}
            isLoadingPlans={isLoadingPlans}
            isPlansError={isPlansError}
            isOnline={isOnline}
            trialExpired={trialExpired}
            trialDaysLeft={trialDaysLeft}
            trialUrgent={trialUrgent}
            selectedInterval={selectedInterval}
            onSelectInterval={setSelectedInterval}
            checkoutLoading={checkoutLoading}
            checkoutError={checkoutError}
            yearlyOffer={playBilling.yearlyOffer}
            monthlyDisplayPrice={playBilling.monthlyOffer?.displayPrice}
            yearlyDisplayPrice={playBilling.yearlyOffer?.displayPrice}
            isReferralPricing={playBilling.isReferralPricing}
            isRestoring={playBilling.isRestoring}
            onCheckout={handleCheckout}
            onRestore={() => {
              void playBilling.restorePurchases()
            }}
            onRetryPlans={() => {
              refetchPlans().catch(() => {})
            }}
            t={t}
            tokens={tokens}
          />
        )}

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
