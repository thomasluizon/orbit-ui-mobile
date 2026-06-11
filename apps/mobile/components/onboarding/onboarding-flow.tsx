import { useState, useMemo, useCallback } from 'react'
import {
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
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const MOBILE_ASTRA_OFFSET = 1

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
          <View style={styles.stepWrapper}>{stepContent}</View>
        </KeyboardAwareScrollView>

        {!hideFooter && (
          <View style={styles.footer}>
            <View style={styles.dotsRow}>
              {Array.from({ length: displayTotal }).map((_, i) => (
                <View
                  key={`progress-dot-${i}`}
                  style={[
                    styles.dot,
                    i === displayStep - 1 ? styles.dotActive : null,
                    {
                      backgroundColor:
                        i === displayStep - 1 ? tokens.primary : tokens.fg4,
                    },
                  ]}
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
    dot: {
      width: 8,
      height: 8,
      borderRadius: 999,
    },
    dotActive: {
      width: 24,
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
