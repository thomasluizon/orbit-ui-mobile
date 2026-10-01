import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { buildAccountScopedStorageKey, getTrialDaysLeft, TRIAL_EXPIRED_SEEN_KEY } from '@orbit/shared/utils'
import { ErrorState } from '@/components/ui/error-state'
import { PillButton } from '@/components/ui/pill-button'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import type { SubscriptionInterval } from '@/components/upgrade/types'
import { useOnboardingPlan } from '@/hooks/use-onboarding-plan'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { usePlayBilling } from '@/hooks/use-play-billing'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { getAccountId } from '@/lib/account-scope'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export interface OnboardingProExit { exit: (destination?: string) => void }

export function OnboardingProStep({ onFinish, ref }: Readonly<{ onFinish: (destination?: string) => Promise<void>; ref?: Ref<OnboardingProExit> }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { plan, profile, retry } = useOnboardingPlan()
  const { isOnline } = useOffline()
  const { showSuccess } = useAppToast()
  const plans = useSubscriptionPlans({ enabled: plan === 'Free', handlesError: true })
  const [finishing, setFinishing] = useState(false)
  const [finishFailed, setFinishFailed] = useState(false)
  const finishPending = useRef(false)
  const paidExitStarted = useRef(false)
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutInterval, setCheckoutInterval] = useState<SubscriptionInterval | null>(null)
  const billing = usePlayBilling({ preferReferralOffer: !!plans.plans?.couponPercentOff, onPurchased: async () => { const generation = getAccountGeneration(); await finish(); if (getAccountGeneration() === generation) showSuccess(t('upgrade.purchaseSuccess')) } })
  const checkoutLoading = billing.isProcessing || billing.isRestoring ? checkoutInterval ?? selectedInterval : null

  async function finish(destination?: string) {
    if (finishPending.current) return
    finishPending.current = true
    setFinishing(true)
    setFinishFailed(false)
    const accountId = getAccountId()
    const generation = getAccountGeneration()
    try {
      if (plan === 'Free' && accountId !== null) await AsyncStorage.setItem(buildAccountScopedStorageKey(TRIAL_EXPIRED_SEEN_KEY, accountId), '1')
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
    if (billing.isProcessing || billing.isRestoring || finishing) return
    void finish(destination).catch(() => {})
  }
  useImperativeHandle(ref, () => ({ exit }))
  useEffect(() => {
    if (plan !== 'Pro' || paidExitStarted.current) return
    paidExitStarted.current = true
    void finish().catch(() => {})
  })
  function checkout(interval: SubscriptionInterval) {
    if (!isOnline || billing.isProcessing || billing.isRestoring || finishing) return
    setCheckoutInterval(interval)
    billing.clearError()
    void billing.purchase(interval)
  }

  const title = <Text nativeID="onboarding-title" accessibilityRole="header" style={{ fontFamily: 'Geist_500Medium', fontSize: 20, color: tokens.fg1 }}>{t('upgrade.pitchTitle')}</Text>
  const exitAction = <PillButton variant="ghost" loading={finishing} onClick={() => exit()}>{t('onboarding.flow.done.seeDay')}</PillButton>
  let content
  if (plan === 'loading' || plan === 'Pro') content = <View accessibilityState={{ busy: true }} accessibilityLabel={t('common.loading')} style={styles.stack}>{title}<ProSkeleton color={tokens.bgWell} />{exitAction}</View>
  else if (plan === null) content = <View style={styles.stack}>{title}<ErrorState message={t('upgrade.billing.error')} action={<PillButton variant="ghost" onClick={retry}>{t('upgrade.billing.retry')}</PillButton>} />{exitAction}</View>
  else if (plan === 'Trial') content = <View testID="onboarding-step-trial" style={styles.pitch}><ProPitch inset={false} focusOnMount headingId="onboarding-title" profile={profile ?? null} trialDaysLeft={getTrialDaysLeft(profile)} titleKey="onboarding.flow.trial.title" bodyKey="onboarding.flow.trial.body" dateHint={profile?.trialEndsAt ? t('upgrade.billing.plan.trialHint', { date: new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(profile.trialEndsAt)) }) : undefined} t={t} tokens={tokens} /><PillButton loading={finishing} onClick={() => exit()}>{t('onboarding.flow.done.seeDay')}</PillButton></View>
  else content = <View testID="onboarding-step-paywall" style={styles.stack}>{title}{!isOnline ? <ErrorState message={t('upgrade.billing.offline')} /> : null}<PricingSection inset={false} profile={null} plans={plans.plans} isLoadingPlans={plans.isLoading} isPlansError={plans.isError} isOnline={isOnline} trialDaysLeft={null} selectedInterval={selectedInterval} onSelectInterval={setSelectedInterval} monthlyOffer={billing.monthlyOffer} yearlyOffer={billing.yearlyOffer} checkoutLoading={checkoutLoading ?? (finishing ? 'yearly' : null)} checkoutError={billing.errorKey ? t(billing.errorKey) : ''} checkoutDisabled={!isOnline || billing.isRestoring} onCheckout={checkout} onStayFree={() => exit()} isRestoring={billing.isRestoring} onRestore={() => void billing.restorePurchases()} onRetryPlans={() => void plans.refetch()} t={t} tokens={tokens} /></View>
  return <View style={styles.root}>{content}<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: tokens.fg2 }}>{finishFailed ? t('onboarding.flow.completionFailed') : ''}</Text></View>
}

const styles = StyleSheet.create({ root: { paddingVertical: 32, width: '100%', gap: 16 }, stack: { gap: 24 }, pitch: { gap: 32 } })

function ProSkeleton({ color }: Readonly<{ color: string }>) {
  const block = { backgroundColor: color, borderRadius: 8 }
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 32 }}>
    <View style={{ gap: 12 }}><View style={[block, { height: 12, width: '33%' }]} /><View style={[block, { height: 64, width: '80%' }]} /><View style={[block, { height: 56 }]} /></View>
    <View style={[block, { height: 136, borderRadius: 16 }]} />
    <View style={{ gap: 12 }}>{[0, 1, 2].map((key) => <View key={key} style={[block, { height: 64 }]} />)}</View>
  </View>
}
