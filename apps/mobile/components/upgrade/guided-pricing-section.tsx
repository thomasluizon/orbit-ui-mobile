import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SPACING } from '@orbit/shared/theme'
import type { SubscriptionPlans } from '@orbit/shared/types/subscription'
import { resolveUpgradeOrbitLine, type AstraAllowance } from '@orbit/shared/utils'
import { Badge } from '@/components/ui/badge'
import { ErrorState } from '@/components/ui/error-state'
import { useFlowLookState } from '@/components/ui/flow-look'
import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { MotionPressable } from '@/components/ui/motion-pressable'
import { OrbitMascot } from '@/components/ui/orbit-mascot'
import { PillButton } from '@/components/ui/pill-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useFlowAnnouncement } from '@/hooks/use-flow-announcement'
import type { StoreOffer } from '@/hooks/use-play-billing'
import { buildTiers, type Tier } from './plan-selection'
import { PurchaseNotes, RestoreAction, StayFreeLink } from './pricing-section'
import { ProBenefits } from './pro-benefits'
import { AllowanceComparison, planFactLine } from './pro-pitch'
import { styles } from './styles'
import type { SubscriptionInterval, Tokens, UpgradeTextFn } from './types'

const WIDE_WIDTH = 1024

export interface GuidedPricingSectionProps {
  /** The id of the question, for a host that names its region by it. */
  headingId?: string
  dateHint?: string
  focusOnMount?: boolean
  profile: ({ isTrialActive?: boolean } & AstraAllowance) | null
  /** The usage read of the person. It feeds the Orbit line. */
  usage: { aiMessagesUsed: number; aiMessagesLimit: number } | null
  plans: SubscriptionPlans | null | undefined
  isLoadingPlans: boolean
  isPlansError: boolean
  isLoadingProducts?: boolean
  isProductsError?: boolean
  isOnline: boolean
  trialDaysLeft: number | null
  selectedInterval: SubscriptionInterval
  onSelectInterval: (interval: SubscriptionInterval) => void
  onStayFree: () => void
  monthlyOffer: StoreOffer | null
  yearlyOffer: StoreOffer | null
  checkoutLoading: SubscriptionInterval | null
  checkoutError: string
  checkoutDisabled: boolean
  onCheckout: (interval: SubscriptionInterval) => void
  isRestoring: boolean
  onRestore: () => void
  onRetryPlans: () => void
  t: UpgradeTextFn
  tokens: Tokens
  /** The host draws the primary action in `GuidedPlanFooter`, under its scroller. The block then leaves it out. */
  primaryInFooter?: boolean
}

type PlanState = 'loading' | 'error' | 'ready' | 'absent'

/** The state of the plan options. The App Store path needs both store offers; the other paths need the plans read. */
function resolvePlanState({ plans, isLoadingPlans, isPlansError, isLoadingProducts = false, isProductsError = false, isOnline, monthlyOffer, yearlyOffer }: Pick<GuidedPricingSectionProps,
  'plans' | 'isLoadingPlans' | 'isPlansError' | 'isLoadingProducts' | 'isProductsError' | 'isOnline' | 'monthlyOffer' | 'yearlyOffer'>): PlanState {
  const isApple = Platform.OS === 'ios'
  const shownPlans = isProductsError ? null : plans
  const offersMissing = isApple && (!monthlyOffer || !yearlyOffer)
  if ((!isApple && isLoadingPlans) || isLoadingProducts) return 'loading'
  const failed = (!isApple && isPlansError) || isProductsError || offersMissing
  if (failed && (!shownPlans || isApple) && isOnline) return 'error'
  return (isApple ? !offersMissing : Boolean(shownPlans)) ? 'ready' : 'absent'
}

/** A plan card as an option of the question. A press selects it. The primary action starts the handoff. */
function PlanOption({ tier, recommended, selected, disabled, onSelect, onLook, onLookAway, t, tokens }: Readonly<{
  tier: Tier
  recommended: boolean
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onLook: (control: React.RefObject<View | null>) => void
  onLookAway: () => void
  t: UpgradeTextFn
  tokens: Tokens
}>) {
  const control = useRef<View>(null)
  return (
    <MotionPressable
      ref={control}
      focusInset
      selectionRingWidth={2}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      testID={`upgrade-plan-option-${tier.interval}`}
      onPress={onSelect}
      onFocus={() => onLook(control)}
      onBlur={onLookAway}
      style={({ pressed }) => [localStyles.option, { backgroundColor: pressed ? tokens.bgHover : selected ? tokens.primaryDim : tokens.bgCard }, disabled ? localStyles.disabled : null]}
    >
      <View style={styles.tierHeader}>
        <Text style={[styles.tierName, { color: tokens.fg1 }]}>{tier.name}</Text>
        {recommended ? <Badge>{t('upgrade.plans.recommended')}</Badge> : null}
      </View>
      <Text style={[styles.tierPrice, { color: tokens.fg1 }]}>
        {tier.price}<Text style={[styles.tierPeriod, { color: tokens.fg2 }]}>{tier.period}</Text>
      </Text>
      {tier.heroLine ? <Text style={[styles.tierHero, { color: tokens.fg2 }]}>{tier.heroLine}</Text> : null}
      {tier.secondLine ? <Text style={[styles.tierSecond, { color: tokens.fg2 }]}>{tier.secondLine}</Text> : null}
      {tier.couponLine ? <Text style={[styles.tierCoupon, { color: tokens.fg2 }]}>{tier.couponLine}</Text> : null}
    </MotionPressable>
  )
}

function PlanOptions({ state, disabled, onLook, onLookAway, ...props }: Readonly<Pick<GuidedPricingSectionProps,
  'plans' | 'isProductsError' | 'monthlyOffer' | 'yearlyOffer' | 'selectedInterval' | 'onSelectInterval' | 'onRetryPlans' | 't' | 'tokens'> & {
  state: PlanState
  disabled: boolean
  onLook: (control: React.RefObject<View | null>) => void
  onLookAway: () => void
}>) {
  const { plans, isProductsError = false, monthlyOffer, yearlyOffer, selectedInterval, onSelectInterval, onRetryPlans, t, tokens } = props
  if (state === 'loading') {
    return (
      <View testID="upgrade-plan-options-loading" style={localStyles.options}>
        {(['yearly', 'monthly'] as const).map((interval) => (
          <View key={interval} style={[localStyles.option, { backgroundColor: tokens.bgCard }]}><Skeleton variant="settings" label={t('upgrade.plans.loading')} /></View>
        ))}
      </View>
    )
  }
  if (state === 'error') {
    return <ErrorState message={t('upgrade.plans.error')} action={
      <IconButton label={t('upgrade.plans.retry')} onClick={onRetryPlans}><RefreshCw size={20} strokeWidth={1.5} accessible={false} /></IconButton>
    } />
  }
  if (state === 'absent') return null
  const { annualTier, monthlyTier } = buildTiers({
    plans: (isProductsError ? null : plans) ?? null, monthlyOffer, yearlyOffer,
    monthlyPrice: monthlyOffer?.displayPrice, yearlyPrice: yearlyOffer?.displayPrice, isApple: Platform.OS === 'ios',
  }, t)
  return (
    <View accessibilityLabel={t('upgrade.question')} testID="upgrade-plan-options" style={localStyles.options}>
      {[annualTier, monthlyTier].map((tier) => (
        <PlanOption key={tier.interval} tier={tier} recommended={tier.interval === 'yearly'} selected={tier.interval === selectedInterval}
          disabled={disabled} onSelect={() => onSelectInterval(tier.interval)} onLook={onLook} onLookAway={onLookAway} t={t} tokens={tokens} />
      ))}
    </View>
  )
}

/** What stays under the block: the plan fact, the allowance comparison, what Pro includes, restore and the notes. */
function UpgradeSupport({ profile, trialDaysLeft, dateHint, showNotes, isRestoring, restoreDisabled, onRestore, t, tokens }: Readonly<Pick<GuidedPricingSectionProps,
  'profile' | 'trialDaysLeft' | 'dateHint' | 'isRestoring' | 'onRestore' | 't' | 'tokens'> & { showNotes: boolean; restoreDisabled: boolean }>) {
  return (
    <View testID="upgrade-support" style={localStyles.support}>
      <View style={localStyles.facts}>
        <Text style={[styles.convertEyebrow, { color: tokens.fg3 }]}>{planFactLine(profile, trialDaysLeft, t)}</Text>
        {dateHint ? <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{dateHint}</Text> : null}
        <Text style={[styles.convertPromise, { color: tokens.fg2 }]}>{t('upgrade.convert.promise')}</Text>
        {!profile?.isTrialActive ? <Text style={[styles.convertTrust, { color: tokens.fg3 }]}>{t('upgrade.convert.trustLine')}</Text> : null}
      </View>
      <AllowanceComparison inset={false} profile={profile} t={t} tokens={tokens} />
      <ProBenefits heading t={t} tokens={tokens} />
      {showNotes ? <View style={localStyles.facts}>
        <RestoreAction disabled={restoreDisabled} isRestoring={isRestoring} onRestore={onRestore} t={t} tokens={tokens} />
        <PurchaseNotes t={t} tokens={tokens} />
      </View> : null}
    </View>
  )
}

function orbitLineText(line: ReturnType<typeof resolveUpgradeOrbitLine>, t: UpgradeTextFn): string | null {
  if (!line) return null
  return line.key === 'upgrade.orbitLine.usage' ? t(line.key, { used: line.used, limit: line.limit }) : t(line.key)
}

type PlanPrimaryProps = Pick<GuidedPricingSectionProps, 'plans' | 'isLoadingPlans' | 'isPlansError' | 'isLoadingProducts' | 'isProductsError' | 'isOnline'
  | 'monthlyOffer' | 'yearlyOffer' | 'selectedInterval' | 'checkoutLoading' | 'checkoutDisabled' | 'onCheckout' | 't'>

/** The primary action of the plan question. It starts the handoff of the selected plan, and a wait keeps its label on the skeleton face. */
function PlanPrimary(props: Readonly<PlanPrimaryProps>) {
  const { selectedInterval, checkoutLoading, checkoutDisabled, onCheckout, t } = props
  return (
    <PillButton
      loading={checkoutLoading !== null}
      disabled={resolvePlanState(props) !== 'ready' || checkoutDisabled}
      accessibleName={t(selectedInterval === 'yearly' ? 'upgrade.plans.checkoutLabelRecommended' : 'upgrade.plans.checkoutLabel', { interval: t(`upgrade.plans.${selectedInterval}.name`) })}
      onClick={() => onCheckout(selectedInterval)}
    >
      {t('upgrade.plans.cta')}
    </PillButton>
  )
}

/** True in the compact shell, where the primary action of the plan question is pinned to the bottom, under the scroller. */
export function usePinnedPlanPrimary(): boolean {
  return useWindowDimensions().width < WIDE_WIDTH
}

/** The pinned footer of the compact shell. The host draws it under its scroller, so the scroller ends above it and it never covers a plan card. */
export function GuidedPlanFooter({ endInset = SPACING.s16, tokens, ...props }: Readonly<PlanPrimaryProps & { tokens: Tokens; endInset?: number }>) {
  return (
    <View testID="upgrade-plan-footer" style={[localStyles.footer, { paddingBottom: endInset, backgroundColor: tokens.bg }]}>
      <PlanPrimary {...props} />
    </View>
  )
}

/** The plan question of the upgrade route: Orbit in Parado with one usage fact, the question, the plan cards as its options and one primary action. */
export function GuidedPricingSection(props: Readonly<GuidedPricingSectionProps>) {
  const { headingId, dateHint, focusOnMount = false, profile, usage, plans, isOnline, trialDaysLeft, selectedInterval, onSelectInterval, onStayFree,
    checkoutLoading, checkoutError, isRestoring, onRestore, primaryInFooter = false, t, tokens } = props
  const { width } = useWindowDimensions()
  const wide = width >= WIDE_WIDTH
  const headingRef = useRef<Text>(null)
  const { lookAt, mascotRef, lookAtControl, lookAway } = useFlowLookState()
  const planState = resolvePlanState(props)
  const line = orbitLineText(resolveUpgradeOrbitLine({ isOnline, isLoadingPlans: planState === 'loading', isPlansError: planState === 'error', usage }), t)
  const announcement = useFlowAnnouncement(line, 'plan')
  const checkoutPending = checkoutLoading !== null
  const showNotes = Boolean(plans) || Platform.OS === 'ios'
  useEffect(() => {
    if (focusOnMount && headingRef.current) AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus')
  }, [focusOnMount])

  const selectInterval = (interval: string) => {
    if (interval === 'monthly' || interval === 'yearly') onSelectInterval(interval)
  }

  return (
    <View style={styles.pricingSections}>
      <View testID="upgrade-block" style={localStyles.block}>
        <View ref={mascotRef} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <OrbitMascot size={wide ? 128 : 96} state="parado" lookAt={lookAt} />
        </View>
        {line ? <Text testID="upgrade-orbit-line" style={[localStyles.line, { color: tokens.fg2 }]}>{line}</Text> : null}
        <Text nativeID={headingId} ref={headingRef} accessibilityRole="header" accessibilityHint={line ?? undefined} textBreakStrategy="balanced"
          style={[localStyles.question, wide ? localStyles.questionWide : null, { color: tokens.fg1 }]}>{t('upgrade.question')}</Text>
        <View style={localStyles.choice}>
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
          <PlanOptions {...props} state={planState} disabled={checkoutPending} onLook={lookAtControl} onLookAway={lookAway} />
        </View>
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.errorText, localStyles.centred, { color: tokens.fg2 }]}>{checkoutError}</Text>
        {primaryInFooter && !wide ? null : <View style={wide ? localStyles.primaryWide : localStyles.primary}><PlanPrimary {...props} /></View>}
        {!isOnline ? <Text testID="upgrade-offline-reason" style={[styles.errorText, localStyles.centred, { color: tokens.fg2 }]}>{t('upgrade.billing.offline')}</Text> : null}
        <StayFreeLink disabled={checkoutPending} onStayFree={onStayFree} t={t} tokens={tokens} />
        <Text accessibilityLiveRegion="polite" style={localStyles.announcement}>{announcement}</Text>
      </View>
      <UpgradeSupport profile={profile} trialDaysLeft={trialDaysLeft} dateHint={dateHint} showNotes={showNotes} isRestoring={isRestoring}
        restoreDisabled={isRestoring || !isOnline || checkoutPending} onRestore={onRestore} t={t} tokens={tokens} />
    </View>
  )
}

const localStyles = StyleSheet.create({
  block: { width: '100%', maxWidth: 592, alignSelf: 'center', alignItems: 'center', gap: 24 },
  line: { fontFamily: 'Geist_400Regular', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  question: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 28, lineHeight: 33, textAlign: 'center' },
  questionWide: { fontSize: 34, lineHeight: 39 },
  choice: { width: '100%', gap: 12 },
  options: { width: '100%', gap: 12 },
  option: { minHeight: 72, borderRadius: 20, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', gap: 8, padding: 16 },
  disabled: { opacity: 0.5 },
  centred: { textAlign: 'center' },
  primary: { width: '100%' },
  primaryWide: { width: '100%', maxWidth: 360 },
  footer: { width: '100%', paddingTop: SPACING.s8 },
  announcement: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  support: { width: '100%', gap: 32 },
  facts: { gap: 8 },
})
