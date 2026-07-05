import { useEffect, useState, useMemo, useCallback } from 'react'
import { Animated, Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_HABIT_STEP,
  ONBOARDING_COMPLETE_STEP,
  ONBOARDING_CREATE_HABIT_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils/onboarding'
import { useAuthStore } from '@/stores/auth-store'
import {
  useOnboardingActions,
  useOnboardingHasProAccess,
} from './onboarding-actions-context'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingMeetAstra } from './onboarding-meet-astra'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'
import { OnboardingTemplatePacks } from './onboarding-template-packs'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, easings, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import {
  createStyles,
  type OnboardingFlowStyles,
} from './onboarding-flow.styles'

const MOBILE_ASTRA_OFFSET = 1

interface ProgressDotProps {
  active: boolean
  activeColor: string
  inactiveColor: string
  reducedMotion: boolean
}

const DOT_INACTIVE_SCALE = 7 / 24

function ProgressDot({ active, activeColor, inactiveColor, reducedMotion }: Readonly<ProgressDotProps>) {
  const scale = useMemo(() => new Animated.Value(DOT_INACTIVE_SCALE), [])

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(active ? 1 : DOT_INACTIVE_SCALE)
      return
    }
    const animation = Animated.timing(scale, {
      toValue: active ? 1 : DOT_INACTIVE_SCALE,
      duration: 220,
      easing: toAnimatedEasing(easings.smooth),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [active, reducedMotion, scale])

  return (
    <Animated.View
      style={{
        width: 24,
        height: 7,
        borderRadius: 999,
        backgroundColor: active ? activeColor : inactiveColor,
        transformOrigin: 'left',
        transform: [{ scaleX: scale }],
      }}
    />
  )
}

interface OnboardingStepContentProps {
  viewingAstra: boolean
  sharedStep: number
  createdHabitId: string | null
  createdHabitTitle: string
  createdGoal: boolean
  onHabitCreated: (habitId: string, title: string) => void
  onHabitCompleted: () => void
  onGoalCreated: () => void
  onGoalSkipped: () => void
  onPackCreateOwn: () => void
  onAdvancePastHabits: () => void
  onFinish: () => void
  onImport?: () => void
}

function OnboardingStepContent({
  viewingAstra,
  sharedStep,
  createdHabitId,
  createdHabitTitle,
  createdGoal,
  onHabitCreated,
  onHabitCompleted,
  onGoalCreated,
  onGoalSkipped,
  onPackCreateOwn,
  onAdvancePastHabits,
  onFinish,
  onImport,
}: Readonly<OnboardingStepContentProps>) {
  if (viewingAstra) return <OnboardingMeetAstra key="meet-astra" onImport={onImport} />
  switch (sharedStep) {
    case 0:
      return <OnboardingWelcome key="welcome" />
    case 1:
      return (
        <OnboardingTemplatePacks
          key="template-packs"
          onCreated={onAdvancePastHabits}
          onCreateOwn={onPackCreateOwn}
          onSkip={onAdvancePastHabits}
        />
      )
    case 2:
      return (
        <OnboardingCreateHabit
          key="create-habit"
          onCreated={onHabitCreated}
        />
      )
    case 3:
      return (
        <OnboardingCompleteHabit
          key="complete-habit"
          habitId={createdHabitId}
          habitTitle={createdHabitTitle}
          onCompleted={onHabitCompleted}
        />
      )
    case 4:
      return (
        <OnboardingCreateGoal
          key="create-goal"
          onCreated={onGoalCreated}
          onSkip={onGoalSkipped}
        />
      )
    case 5:
      return <OnboardingFeatures key="features" />
    case 6:
      return (
        <OnboardingComplete
          key="complete"
          createdHabit={createdHabitTitle}
          createdGoal={createdGoal}
          onFinish={onFinish}
        />
      )
    default:
      return null
  }
}

interface OnboardingFooterProps {
  tokens: AppTokensV2
  styles: OnboardingFlowStyles
  displayTotal: number
  displayStep: number
  prefersReducedMotion: boolean
  canAdvance: boolean
  hasPrev: boolean
  isStarter: boolean
  onNext: () => void
  onPrev: () => void
  onHaveAccount?: () => void
}

function OnboardingFooter({
  tokens,
  styles,
  displayTotal,
  displayStep,
  prefersReducedMotion,
  canAdvance,
  hasPrev,
  isStarter,
  onNext,
  onPrev,
  onHaveAccount,
}: Readonly<OnboardingFooterProps>) {
  const { t } = useTranslation()
  return (
    <View style={styles.footer}>
      <View style={styles.dotsRow}>
        {Array.from({ length: displayTotal }).map((_, i) => (
          <ProgressDot
            key={`progress-dot-${i}`}
            active={i === displayStep - 1}
            activeColor={tokens.primary}
            inactiveColor={`${tokens.fg1}2E`}
            reducedMotion={prefersReducedMotion}
          />
        ))}
      </View>

      <View style={styles.footerActions}>
        <View style={styles.footerSide}>
          {hasPrev && (
            <Pressable
              onPress={onPrev}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.textButtonPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>
                {t('onboarding.flow.back')}
              </Text>
            </Pressable>
          )}
        </View>
        <View style={styles.footerCenter}>
          {canAdvance && (
            <PillButton onPress={onNext}>
              {isStarter
                ? t('onboarding.flow.begin')
                : t('onboarding.flow.next')}
            </PillButton>
          )}
        </View>
        <View style={styles.footerSide} />
      </View>

      {onHaveAccount && (
        <Pressable
          onPress={onHaveAccount}
          hitSlop={8}
          style={({ pressed }) => [
            styles.haveAccountButton,
            pressed && styles.textButtonPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.haveAccountText}>
            {t('onboarding.flow.saveYourPlan.haveAccount')}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

export function OnboardingFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const actions = useOnboardingActions()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hasProAccess = useOnboardingHasProAccess()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const [sharedStep, setSharedStep] = useState(0)
  const [astraStepShown, setAstraStepShown] = useState(false)
  const [viewingAstra, setViewingAstra] = useState(false)
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [createdGoal, setCreatedGoal] = useState(false)
  const [stepDirection, setStepDirection] = useState<'forward' | 'back'>('forward')
  const prefersReducedMotion = usePrefersReducedMotion()
  const stepEntrance = useMemo(() => new Animated.Value(1), [])

  const sharedDisplayTotal = getOnboardingDisplayTotal(hasProAccess)
  const displayTotal = sharedDisplayTotal + MOBILE_ASTRA_OFFSET
  const displayStep = useMemo(() => {
    const sharedDisplay = getOnboardingDisplayStep(sharedStep, hasProAccess)
    if (viewingAstra) return 2
    if (astraStepShown) return sharedDisplay + MOBILE_ASTRA_OFFSET
    return sharedDisplay
  }, [sharedStep, hasProAccess, viewingAstra, astraStepShown])

  const hasPrev = sharedStep > 0 || viewingAstra
  const canAdvance = sharedStep !== ONBOARDING_COMPLETE_STEP
  const isFinalStep = sharedStep === ONBOARDING_COMPLETE_STEP
  const isStarter = sharedStep === 0 && !viewingAstra && !astraStepShown

  const goNext = useCallback(() => {
    setStepDirection('forward')
    if (sharedStep === 0 && !astraStepShown) {
      setViewingAstra(true)
      setAstraStepShown(true)
      return
    }
    if (viewingAstra) {
      setViewingAstra(false)
      setSharedStep((s) => getOnboardingNextStep(s, hasProAccess))
      return
    }
    setSharedStep((s) => getOnboardingNextStep(s, hasProAccess))
  }, [sharedStep, astraStepShown, viewingAstra, hasProAccess])

  const goPrev = useCallback(() => {
    setStepDirection('back')
    if (viewingAstra) {
      setViewingAstra(false)
      return
    }
    if (sharedStep === 1 && astraStepShown) {
      setViewingAstra(true)
      setSharedStep(0)
      return
    }
    setSharedStep((s) => getOnboardingPreviousStep(s, hasProAccess))
  }, [sharedStep, astraStepShown, viewingAstra, hasProAccess])

  useEffect(() => {
    if (prefersReducedMotion) {
      stepEntrance.setValue(1)
      return
    }
    stepEntrance.setValue(0)
    const animation = Animated.timing(stepEntrance, {
      toValue: 1,
      duration: 280,
      easing: toAnimatedEasing(easings.out),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [prefersReducedMotion, sharedStep, stepEntrance, viewingAstra])

  function handleHabitCreated(habitId: string, title: string) {
    setCreatedHabitId(habitId)
    setCreatedHabitTitle(title)
    goNext()
  }

  function handleHabitCompleted() {
    goNext()
  }

  function handleGoalCreated() {
    setCreatedGoal(true)
    goNext()
  }

  function handleGoalSkipped() {
    goNext()
  }

  function advancePastHabitSteps() {
    setStepDirection('forward')
    setSharedStep(getOnboardingNextStep(ONBOARDING_COMPLETE_HABIT_STEP, hasProAccess))
  }

  function handleCreateOwnInstead() {
    setStepDirection('forward')
    setSharedStep(ONBOARDING_CREATE_HABIT_STEP)
  }

  function handleFinish() {
    void actions.finishOnboarding()
  }

  function handleHaveAccount() {
    router.replace('/login')
  }

  function handleSkip() {
    setStepDirection('forward')
    setViewingAstra(false)
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  const hideFooter = !viewingAstra && shouldHideOnboardingFooter(sharedStep)

  function handleRequestClose() {
    if (hasPrev) goPrev()
  }

  if (pathname.startsWith('/chat')) return null

  return (
    <Modal
      visible
      animationType="none"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.container}>
        <GradientTop height={520} />
        <View
          style={[
            styles.header,
            { paddingTop: insets.top > 0 ? insets.top + 8 : 48 },
          ]}
        >
          <Text style={styles.progressLabel}>
            Orbit ·{' '}
            <Text style={{ color: tokens.fg1 }}>
              {String(displayStep).padStart(2, '0')}
            </Text>{' '}
            / {String(displayTotal).padStart(2, '0')}
          </Text>
          {!isFinalStep && (
            <Pressable
              onPress={handleSkip}
              hitSlop={8}
              style={({ pressed }) => [
                styles.skipButton,
                pressed && styles.textButtonPressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>
                {t('onboarding.flow.skip')}
              </Text>
            </Pressable>
          )}
        </View>

        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardVerticalOffset={12}
        >
          <Animated.View
            style={[
              styles.stepWrapper,
              {
                opacity: stepEntrance,
                transform: [
                  {
                    translateX: stepEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [stepDirection === 'forward' ? 30 : -30, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <OnboardingStepContent
              viewingAstra={viewingAstra}
              sharedStep={sharedStep}
              createdHabitId={createdHabitId}
              createdHabitTitle={createdHabitTitle}
              createdGoal={createdGoal}
              onHabitCreated={handleHabitCreated}
              onHabitCompleted={handleHabitCompleted}
              onGoalCreated={handleGoalCreated}
              onGoalSkipped={handleGoalSkipped}
              onPackCreateOwn={handleCreateOwnInstead}
              onAdvancePastHabits={advancePastHabitSteps}
              onFinish={handleFinish}
              onImport={actions.onImport}
            />
          </Animated.View>
        </KeyboardAwareScrollView>

        {!hideFooter && (
          <OnboardingFooter
            tokens={tokens}
            styles={styles}
            displayTotal={displayTotal}
            displayStep={displayStep}
            prefersReducedMotion={prefersReducedMotion}
            canAdvance={canAdvance}
            hasPrev={hasPrev}
            isStarter={isStarter}
            onNext={goNext}
            onPrev={goPrev}
            onHaveAccount={
              isStarter && !isAuthenticated ? handleHaveAccount : undefined
            }
          />
        )}
      </View>
    </Modal>
  )
}
