import { useState, useMemo, useCallback } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  getOnboardingDisplayStep,
  getOnboardingDisplayTotal,
  getOnboardingNextStep,
  getOnboardingPreviousStep,
  ONBOARDING_COMPLETE_STEP,
  ONBOARDING_CREATE_HABIT_STEP,
  shouldHideOnboardingFooter,
} from '@orbit/shared/utils/onboarding'
import {
  useOnboardingActions,
  useOnboardingIsLive,
} from './onboarding-actions-context'
import { OnboardingWelcome } from './onboarding-welcome'
import { OnboardingCreateHabit } from './onboarding-create-habit'
import { OnboardingComplete } from './onboarding-complete'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Pager } from '@/components/ui/pager'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useUIStore } from '@/stores/ui-store'
import {
  createStyles,
  type OnboardingFlowStyles,
} from './onboarding-flow.styles'

interface OnboardingStepContentProps {
  sharedStep: number
  createdHabitTitle: string
  onHabitCreated: (habitId: string, title: string) => void
  onFinish: () => void
  finishLabel?: string
}

function OnboardingStepContent({
  sharedStep,
  createdHabitTitle,
  onHabitCreated,
  onFinish,
  finishLabel,
}: Readonly<OnboardingStepContentProps>) {
  switch (sharedStep) {
    case 0:
      return <OnboardingWelcome key="welcome" />
    case ONBOARDING_CREATE_HABIT_STEP:
      return (
        <OnboardingCreateHabit
          key="create-habit"
          onCreated={onHabitCreated}
        />
      )
    case ONBOARDING_COMPLETE_STEP:
      return (
        <OnboardingComplete
          key="complete"
          createdHabit={createdHabitTitle}
          finishLabel={finishLabel}
          onFinish={onFinish}
        />
      )
    default:
      return null
  }
}

interface OnboardingFooterProps {
  styles: OnboardingFlowStyles
  displayTotal: number
  displayStep: number
  canAdvance: boolean
  hasPrev: boolean
  isStarter: boolean
  onNext: () => void
  onPrev: () => void
  onHaveAccount?: () => void
}

function OnboardingFooter({
  styles,
  displayTotal,
  displayStep,
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
      <Pager index={displayStep - 1} count={displayTotal}
        label={t('onboarding.flow.step', { current: displayStep, total: displayTotal })}
        backLabel={t('onboarding.flow.back')} onBack={hasPrev ? onPrev : undefined}
        forwardLabel={isStarter ? t('onboarding.flow.begin') : t('onboarding.flow.next')}
        onForward={canAdvance ? onNext : undefined} />

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
  const astraConversationOpen = useUIStore((state) => state.astraConversationOpen)
  const insets = useSafeAreaInsets()
  const actions = useOnboardingActions()
  const isLive = useOnboardingIsLive()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])

  const [sharedStep, setSharedStep] = useState(0)
  const [createdHabitTitle, setCreatedHabitTitle] = useState('')

  const displayTotal = getOnboardingDisplayTotal()
  const displayStep = getOnboardingDisplayStep(sharedStep)

  const hasPrev = sharedStep > 0
  const canAdvance = sharedStep !== ONBOARDING_COMPLETE_STEP
  const isFinalStep = sharedStep === ONBOARDING_COMPLETE_STEP
  const isStarter = sharedStep === 0

  const goNext = useCallback(() => {
    setSharedStep((step) => getOnboardingNextStep(step))
  }, [])

  const goPrev = useCallback(() => {
    setSharedStep((step) => getOnboardingPreviousStep(step))
  }, [])

  function handleHabitCreated(_habitId: string, title: string) {
    setCreatedHabitTitle(title)
    goNext()
  }

  function handleFinish() {
    void actions.finishOnboarding()
  }

  function handleHaveAccount() {
    router.replace('/login')
  }

  function handleSkip() {
    setSharedStep(ONBOARDING_COMPLETE_STEP)
  }

  const hideFooter = shouldHideOnboardingFooter(sharedStep)

  function handleRequestClose() {
    if (hasPrev) goPrev()
  }

  if (astraConversationOpen) return null

  return (
    <Modal
      visible
      animationType="none"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.container}>
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
          <View style={styles.stepWrapper}>
            <OnboardingStepContent
              sharedStep={sharedStep}
              createdHabitTitle={createdHabitTitle}
              onHabitCreated={handleHabitCreated}
              onFinish={handleFinish}
              finishLabel={
                !isLive ? t('onboarding.flow.saveYourPlan.cta') : undefined
              }
            />
          </View>
        </KeyboardAwareScrollView>

        {!hideFooter && (
          <OnboardingFooter
            styles={styles}
            displayTotal={displayTotal}
            displayStep={displayStep}
            canAdvance={canAdvance}
            hasPrev={hasPrev}
            isStarter={isStarter}
            onNext={goNext}
            onPrev={goPrev}
            onHaveAccount={
              isStarter && !isLive ? handleHaveAccount : undefined
            }
          />
        )}
      </View>
    </Modal>
  )
}
