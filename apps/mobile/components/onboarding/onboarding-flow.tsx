import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils/onboarding'
import { profileKeys } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { Profile } from '@orbit/shared/types/profile'
import { useHasProAccess } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingMeetAstra } from './onboarding-meet-astra'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, easings, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

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

export function OnboardingFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = useHasProAccess()
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

  async function handleFinish() {
    try {
      await performQueuedApiMutation({
        type: 'completeOnboarding',
        scope: 'profile',
        endpoint: API.profile.onboarding,
        method: 'PUT',
        payload: undefined,
        dedupeKey: 'profile-onboarding-complete',
      })
    } catch {
    }
    queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
      old ? { ...old, hasCompletedOnboarding: true } : old,
    )
    router.replace('/')
  }

  function handleSkip() {
    setViewingAstra(false)
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  const hideFooter = !viewingAstra && shouldHideOnboardingFooter(sharedStep)

  const stepContent = (() => {
    if (viewingAstra) return <OnboardingMeetAstra key="meet-astra" />
    switch (sharedStep) {
      case 0:
        return <OnboardingWelcome key="welcome" />
      case 1:
        return (
          <OnboardingCreateHabit
            key="create-habit"
            onCreated={handleHabitCreated}
          />
        )
      case 2:
        return (
          <OnboardingCompleteHabit
            key="complete-habit"
            habitId={createdHabitId}
            habitTitle={createdHabitTitle}
            onCompleted={handleHabitCompleted}
          />
        )
      case 3:
        return (
          <OnboardingCreateGoal
            key="create-goal"
            onCreated={handleGoalCreated}
            onSkip={handleGoalSkipped}
          />
        )
      case 4:
        return <OnboardingFeatures key="features" />
      case 5:
        return (
          <OnboardingComplete
            key="complete"
            createdHabit={createdHabitTitle}
            createdGoal={createdGoal}
            onFinish={handleFinish}
          />
        )
      default:
        return null
    }
  })()

  const progressLabel = `Orbit · ${String(displayStep).padStart(2, '0')} / ${String(displayTotal).padStart(2, '0')}`

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.container}>
        <GradientTop height={520} />
        <View style={styles.header}>
          <Text style={styles.progressLabel}>{progressLabel}</Text>
          {!isFinalStep && (
            <Pressable onPress={handleSkip} hitSlop={8} style={styles.skipButton}>
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
            {stepContent}
          </Animated.View>
        </KeyboardAwareScrollView>

        {!hideFooter && (
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
              {canAdvance && (
                <PillButton fullWidth onPress={goNext}>
                  {isStarter
                    ? t('onboarding.flow.begin')
                    : t('onboarding.flow.next')}
                </PillButton>
              )}
              {hasPrev && (
                <Pressable
                  onPress={goPrev}
                  style={styles.backButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.backText}>
                    {t('onboarding.flow.back')}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 48,
      paddingBottom: 0,
      minHeight: 56,
    },
    progressLabel: {
      fontFamily: 'Roboto_500Medium',
      fontSize: 11,
      color: tokens.fg3,
      letterSpacing: 0.44,
      fontVariant: ['tabular-nums'],
    },
    skipButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    skipText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 28,
    },
    stepWrapper: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
      flexGrow: 1,
      justifyContent: 'center',
    },
    footer: {
      paddingHorizontal: 28,
      paddingTop: 12,
      paddingBottom: 32,
      gap: 22,
      alignItems: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    footerActions: {
      width: '100%',
      gap: 4,
      alignItems: 'center',
    },
    backButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    backText: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 13,
      color: tokens.fg3,
    },
  })
}
