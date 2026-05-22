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
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// v8 inserts a "Meet Astra" step between Welcome and Create Habit. We mirror the
// web approach: a parallel `viewingAstra` boolean drives the interstitial
// without altering the shared step constants. The shared total is 6; the v8
// progress label shows N+1 (7) once Astra has been visited.
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
    if (viewingAstra) return 2 // Astra sits between Welcome (1) and CreateHabit (3)
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
      // Ignore -- user should proceed regardless
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
        {/* Header: mono progress label + Skip */}
        <View style={styles.header}>
          <Text style={styles.progressLabel}>{progressLabel}</Text>
          {!isFinalStep && (
            <Pressable onPress={handleSkip} hitSlop={8}>
              <Text style={styles.skipText}>
                {t('onboarding.flow.skip')}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Step content (scrollable) */}
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardVerticalOffset={12}
        >
          <View style={styles.stepWrapper}>{stepContent}</View>
        </KeyboardAwareScrollView>

        {/* Footer: progress dots + Back / Continue */}
        {!hideFooter && (
          <View style={styles.footer}>
            <View style={styles.dotsRow}>
              {Array.from({ length: displayTotal }).map((_, i) => (
                <View
                  // NOSONAR -- progress dot index identifies the slot
                  key={`progress-dot-${i}`}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        i <= displayStep - 1
                          ? tokens.primary
                          : tokens.hairlineStrong,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.footerRow}>
              <View style={styles.footerSide}>
                {hasPrev && (
                  <Pressable onPress={goPrev} hitSlop={8}>
                    <Text style={styles.backText}>
                      {t('onboarding.flow.back')}
                    </Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.footerCenter}>
                {canAdvance && (
                  <Pressable
                    onPress={goNext}
                    style={({ pressed }) => [
                      styles.nextBtn,
                      {
                        backgroundColor: pressed
                          ? tokens.primaryPressed
                          : tokens.primary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.nextBtnText,
                        { color: tokens.fgOnPrimary },
                      ]}
                    >
                      {isStarter
                        ? t('onboarding.flow.begin')
                        : t('onboarding.flow.next')}
                    </Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.footerSide} />
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
      paddingTop: 56,
      paddingBottom: 8,
    },
    progressLabel: {
      fontFamily: 'GeistMono',
      fontSize: 11,
      fontWeight: '500',
      color: tokens.fg3,
      letterSpacing: 0.44,
    },
    skipText: {
      fontFamily: 'Geist',
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
    },
    footer: {
      paddingHorizontal: 22,
      paddingTop: 12,
      paddingBottom: 40,
      gap: 14,
      alignItems: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      gap: 6,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 999,
    },
    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      gap: 12,
    },
    footerSide: {
      flex: 1,
      alignItems: 'flex-start',
    },
    footerCenter: {
      flex: 2,
    },
    backText: {
      fontFamily: 'Geist',
      fontSize: 13,
      color: tokens.fg3,
      paddingVertical: 6,
    },
    nextBtn: {
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextBtnText: {
      fontFamily: 'Geist',
      fontSize: 14,
      fontWeight: '600',
    },
  })
}
