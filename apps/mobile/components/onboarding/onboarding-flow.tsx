import { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
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
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingCompleteHabit } from './onboarding-complete-habit'
import { OnboardingCreateGoal } from './onboarding-create-goal'
import { OnboardingFeatures } from './onboarding-features'
import { OnboardingComplete } from './onboarding-complete'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { radius, shadows } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OnboardingFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasProAccess = useHasProAccess()
  const { colors } = useAppTheme()
  const styles = useMemo(() => createStyles(colors), [colors])

  const [currentStep, setCurrentStep] = useState(0)
  const [createdHabitId, setCreatedHabitId] = useState<string | null>(null)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')
  const [createdGoal, setCreatedGoal] = useState(false)

  const displayTotal = getOnboardingDisplayTotal(hasProAccess)
  const displayStep = useMemo(
    () => getOnboardingDisplayStep(currentStep, hasProAccess),
    [currentStep, hasProAccess],
  )

  const hasPrev = currentStep > 0
  const canAdvance = currentStep !== ONBOARDING_COMPLETE_STEP

  const goNext = useCallback(() => {
    setCurrentStep((previousStep) =>
      getOnboardingNextStep(previousStep, hasProAccess),
    )
  }, [hasProAccess])

  const goPrev = useCallback(() => {
    setCurrentStep((previousStep) =>
      getOnboardingPreviousStep(previousStep, hasProAccess),
    )
  }, [hasProAccess])

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
    // Jump to the complete step so trial info is shown
    setCurrentStep(5)
  }

  // Interactive steps that hide the footer nav
  const hideFooter = shouldHideOnboardingFooter(currentStep)

  const stepContent = (() => {
    switch (currentStep) {
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

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.stepIndicator}>
            {t('onboarding.flow.step', {
              current: displayStep,
              total: displayTotal,
            })}
          </Text>
          <TouchableOpacity activeOpacity={0.7} onPress={handleSkip}>
            <Text style={styles.skipText}>{t('onboarding.flow.skip')}</Text>
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(displayStep / displayTotal) * 100}%`,
                },
              ]}
            />
          </View>
        </View>

        {/* Step content */}
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardVerticalOffset={12}
        >
          <View style={styles.stepWrapper}>{stepContent}</View>
        </KeyboardAwareScrollView>

        {/* Footer navigation */}
        {!hideFooter && (
          <View style={styles.footer}>
            {hasPrev ? (
              <TouchableOpacity activeOpacity={0.7} onPress={goPrev}>
                <Text style={styles.backText}>{t('onboarding.flow.back')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.spacer} />
            )}

            {canAdvance && (
              <TouchableOpacity
                style={styles.nextBtn}
                activeOpacity={0.8}
                onPress={goNext}
              >
                <Text style={styles.nextBtnText}>
                  {t('onboarding.flow.next')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useAppTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingTop: 56, // safe area
      paddingBottom: 16,
    },
    stepIndicator: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    skipText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    progressContainer: {
      paddingHorizontal: 24,
      marginBottom: 32,
    },
    progressTrack: {
      height: 2,
      borderRadius: 1,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    progressFill: {
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.primary,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingBottom: 32,
    },
    stepWrapper: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingBottom: 40,
      gap: 16,
    },
    spacer: {
      flex: 1,
    },
    backText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    nextBtn: {
      paddingHorizontal: 24,
      paddingVertical: 10,
      backgroundColor: colors.primary,
      borderRadius: radius.xl,
      ...shadows.sm,
      elevation: 3,
    },
    nextBtnText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '600',
    },
  })
}
