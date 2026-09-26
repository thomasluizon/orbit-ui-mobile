import { lazy, Suspense, type Ref } from 'react'
import Constants from 'expo-constants'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { AstraImportPrompt } from '@/components/onboarding/astra-import-prompt'
import { AchievementToast } from '@/components/gamification/achievement-toast'
import { AllDoneCelebration } from '@/components/gamification/all-done-celebration'
import { GoalCompletedCelebration } from '@/components/gamification/goal-completed-celebration'
import { LevelUpOverlay } from '@/components/gamification/level-up-overlay'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { ReviewMomentSheet } from '@/components/review-moment/review-moment-sheet'
import { StreakCelebration } from '@/components/gamification/streak-celebration'
import {
  StreakFreezeCelebration,
  type StreakFreezeCelebrationHandle,
} from '@/components/gamification/streak-freeze-celebration'
import { WelcomeBackToast } from '@/components/gamification/welcome-back-toast'
import { ExpiryWarning } from '@/components/ui/expiry-warning'
import { TrialExpiredModal } from '@/components/ui/trial-expired-modal'
import { VersionUpdateDrawer } from '@/components/version-update-drawer'
import { TourProvider } from '@/components/tour/tour-provider'
import { TourOverlay } from '@/components/tour/tour-overlay'

const isExpoGo = Constants.expoGoConfig !== null
const PushPrompt = isExpoGo
  ? () => null
  : lazy(() =>
      import('@/components/ui/push-prompt').then((m) => ({
        default: m.PushPrompt,
      })),
    )

export interface OverlayLayerProps {
  hasCompletedOnboarding: boolean
  hasProAccess: boolean
  canViewGamification: boolean
  showRetainedOnboarding: boolean
  onboardingActions: OnboardingActions
  leveledUp: boolean
  newLevel: number | null
  onClearLevelUp: () => void
  streakFreezeRef: Ref<StreakFreezeCelebrationHandle>
}

export function OverlayLayer({
  hasCompletedOnboarding,
  hasProAccess,
  canViewGamification,
  showRetainedOnboarding,
  onboardingActions,
  leveledUp,
  newLevel,
  onClearLevelUp,
  streakFreezeRef,
}: Readonly<OverlayLayerProps>) {
  return (
    <>
      <ExpiryWarning />
      <TrialExpiredModal />
      {showRetainedOnboarding ? (
        <OnboardingActionsProvider
          actions={onboardingActions}
          hasProAccess={hasProAccess}
          isLive
        >
          <OnboardingFlow />
        </OnboardingActionsProvider>
      ) : null}
      <Suspense fallback={null}>
        {hasCompletedOnboarding ? <PushPrompt /> : null}
      </Suspense>
      {hasCompletedOnboarding ? (
        <>
          <StreakCelebration />
          <AllDoneCelebration />
          <GoalCompletedCelebration />
          <WelcomeBackToast />
          {hasProAccess ? <AchievementToast /> : null}
          {canViewGamification ? (
            <LevelUpOverlay
              leveledUp={leveledUp}
              newLevel={newLevel}
              onClear={onClearLevelUp}
            />
          ) : null}
          <MarketingConsentPrompt />
          <ReferralPrompt />
          <MilestoneSharePrompt />
          <ReviewMomentSheet />
        </>
      ) : null}
      <StreakFreezeCelebration ref={streakFreezeRef} />
      {hasCompletedOnboarding ? (
        <>
          <CalendarImportPrompt />
          <AstraImportPrompt />
        </>
      ) : null}
      <VersionUpdateDrawer />
      <TourProvider>
        <TourOverlay />
      </TourProvider>
    </>
  )
}
