import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { SPACING } from '@orbit/shared/theme'
import { useEffect, useImperativeHandle, useRef, useState, type ComponentProps, type ReactNode, type Ref } from 'react'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTranslation } from 'react-i18next'
import { buildAccountScopedStorageKey, getTrialDaysLeft, TRIAL_EXPIRED_SEEN_KEY } from '@orbit/shared/utils'
import { ErrorState } from '@/components/ui/error-state'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { Skeleton } from '@/components/ui/skeleton'
import { GuidedPlanFooter, GuidedPricingSection, usePinnedPlanPrimary } from '@/components/upgrade/guided-pricing-section'
import { PricingSection } from '@/components/upgrade/pricing-section'
import { ProPitch } from '@/components/upgrade/pro-pitch'
import type { SubscriptionInterval } from '@/components/upgrade/types'
import { useFlag } from '@/hooks/use-flag'
import { useOnboardingPlan } from '@/hooks/use-onboarding-plan'
import { useSubscriptionPlans } from '@/hooks/use-subscription-plans'
import { useStoreBilling } from '@/hooks/store-billing-provider'
import { useOffline } from '@/hooks/use-offline'
import { useAppToast } from '@/hooks/use-app-toast'
import { getAccountId } from '@/lib/account-scope'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2, radius } from '@/lib/theme'

export interface OnboardingProExit { exit: (destination?: string) => void }

/** How a host lays out the step: the body in its scroller, and the pinned plan footer under it. */
export type OnboardingProFrame = (body: ReactNode, footer: ReactNode) => ReactNode

const inlineFrame: OnboardingProFrame = (body, footer) => <>{body}{footer}</>

function usePaywallFooter(guided: boolean, plan: ReturnType<typeof useOnboardingPlan>['plan']): boolean {
  const pinned = usePinnedPlanPrimary()
  return guided && pinned && plan === 'Free'
}

export function OnboardingProStep({ onFinish, ref, frame = inlineFrame }: Readonly<{ onFinish: (destination?: string) => Promise<void>; ref?: Ref<OnboardingProExit>; frame?: OnboardingProFrame }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { plan, profile, retry } = useOnboardingPlan()
  const { isOnline } = useOffline()
  const guided = useFlag('orbit_guided_flows')
  const paywallFooter = usePaywallFooter(guided, plan)
  const { showSuccess } = useAppToast()
  const plans = useSubscriptionPlans({ enabled: plan === 'Free', handlesError: true })
  const [finishing, setFinishing] = useState(false)
  const [finishFailed, setFinishFailed] = useState(false)
  const finishPending = useRef(false)
  const paidExitStarted = useRef(false)
  const [selectedInterval, setSelectedInterval] = useState<SubscriptionInterval>('yearly')
  const [checkoutInterval, setCheckoutInterval] = useState<SubscriptionInterval | null>(null)
  const billing = useStoreBilling({ preferReferralOffer: !!plans.plans?.couponPercentOff, onPurchased: async () => { const generation = getAccountGeneration(); await finish(); if (getAccountGeneration() === generation) showSuccess(t('upgrade.purchaseSuccess')) } })
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
  async function checkout(interval: SubscriptionInterval) {
    if (!isOnline || billing.isProcessing || billing.isRestoring || finishing) return
    setCheckoutInterval(interval)
    billing.clearError()
    const started = await billing.purchase(interval)
    if (!started) setCheckoutInterval(null)
  }

  const pricing: Omit<ComponentProps<typeof PricingSection>, 'inset'> = {
    profile: null,
    plans: plans.plans,
    isLoadingPlans: plans.isLoading,
    isPlansError: plans.isError,
    isLoadingProducts: billing.isLoadingProducts,
    isProductsError: billing.isProductsError,
    isOnline,
    trialDaysLeft: null,
    selectedInterval,
    onSelectInterval: setSelectedInterval,
    monthlyOffer: billing.monthlyOffer,
    yearlyOffer: billing.yearlyOffer,
    checkoutLoading: checkoutLoading ?? (finishing ? 'yearly' : null),
    checkoutError: billing.errorKey ? t(billing.errorKey) : '',
    checkoutDisabled: !isOnline || billing.isRestoring,
    onCheckout: (interval) => { void checkout(interval) },
    onStayFree: () => exit(),
    isRestoring: billing.isRestoring,
    onRestore: () => void billing.restorePurchases(),
    onRetryPlans: () => { if (isOnline) { billing.retryProducts(); void plans.refetch() } },
    t,
    tokens,
  }
  const title = <StepTitle guided={guided} color={tokens.fg1} t={t} />
  const exitAction = <PillButton variant="ghost" loading={finishing} onClick={() => exit()}>{t('onboarding.flow.done.seeDay')}</PillButton>
  let content
  if (plan === 'loading' || plan === 'Pro' || plan === null) content = <PlanReadState guided={guided} failed={plan === null} title={title} exitAction={exitAction} onRetry={retry} t={t} />
  else if (plan === 'Trial') content = <View testID="onboarding-step-trial" style={styles.pitch}><GuidedOrbit guided={guided} /><ProPitch inset={false} focusOnMount headingId="onboarding-title" profile={profile ?? null} trialDaysLeft={getTrialDaysLeft(profile)} titleKey="onboarding.flow.trial.title" bodyKey="onboarding.flow.trial.body" dateHint={profile?.trialEndsAt ? t('upgrade.billing.plan.trialHint', { date: new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(profile.trialEndsAt)) }) : undefined} t={t} tokens={tokens} /><PillButton loading={finishing} onClick={() => exit()}>{t('onboarding.flow.done.seeDay')}</PillButton></View>
  else content = <View testID="onboarding-step-paywall" style={styles.stack}>{guided
    ? <GuidedPricingSection headingId="onboarding-title" focusOnMount usage={profile ?? null} primaryInFooter={paywallFooter} {...pricing} />
    : <>{title}{!isOnline ? <ErrorState message={t('upgrade.billing.offline')} /> : null}<PricingSection inset={false} {...pricing} /></>}</View>
  const body = <View style={styles.root}>{content}<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: tokens.fg2 }}>{finishFailed ? t('onboarding.flow.completionFailed') : ''}</Text></View>
  return frame(body, paywallFooter ? <GuidedPlanFooter {...pricing} tokens={tokens} /> : null)
}

function StepTitle({ guided, color, t }: Readonly<{ guided: boolean; color: string; t: (key: string) => string }>) {
  if (guided) return <Text nativeID="onboarding-title" accessibilityRole="header" textBreakStrategy="balanced" style={[styles.question, { color }]}>{t('upgrade.question')}</Text>
  return <Text nativeID="onboarding-title" accessibilityRole="header" style={{ fontFamily: 'Geist_500Medium', fontSize: 20, color }}>{t('upgrade.pitchTitle')}</Text>
}

function PlanReadState({ guided, failed, title, exitAction, onRetry, t }: Readonly<{
  guided: boolean
  failed: boolean
  title: ReactNode
  exitAction: ReactNode
  onRetry: () => void
  t: (key: string) => string
}>) {
  const heading = guided ? <><GuidedOrbit guided />{title}</> : title
  if (!failed) return <View accessibilityState={{ busy: true }} accessibilityLabel={t('common.loading')} style={styles.stack}>{heading}<ProSkeleton />{exitAction}</View>
  const retry = <IconButton label={t('upgrade.billing.retry')} onClick={onRetry}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
  return <View style={styles.stack}>{heading}<ErrorState message={t(guided ? 'upgrade.orbitLine.billingError' : 'upgrade.billing.error')} action={retry} />{exitAction}</View>
}

function GuidedOrbit({ guided }: Readonly<{ guided: boolean }>) {
  const mascotSize = useStateMascotSize()
  if (!guided) return null
  return <View testID="onboarding-orbit" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.orbit}><OrbitMascot size={mascotSize} state="parado" /></View>
}

const styles = StyleSheet.create({
  root: { paddingVertical: SPACING.s32, width: '100%', gap: 16 },
  stack: { gap: 24 },
  pitch: { gap: 32 },
  orbit: { alignSelf: 'center' },
  question: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
})

function ProSkeleton() {
  return <View testID="pro-skeleton" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ gap: 32 }}>
    <View style={{ gap: 12 }}>{[{ height: 12, width: '33%' as const }, { height: 64, width: '80%' as const }, { height: 56 }].map((size) => <ProSkeletonBlock key={size.height} style={size} />)}</View>
    <ProSkeletonBlock style={{ height: 136, borderRadius: radius.xl, overflow: 'hidden' }} />
    <View style={{ gap: 12 }}>{[0, 1, 2].map((key) => <ProSkeletonBlock key={key} style={{ height: 64 }} />)}</View>
  </View>
}

function ProSkeletonBlock({ style }: Readonly<{ style: ViewStyle }>) {
  return <View style={style}><Skeleton variant="fill" grouped /></View>
}
