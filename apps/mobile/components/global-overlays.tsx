import { lazy, Suspense } from 'react'
import Constants from 'expo-constants'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import {
  OnboardingActionsProvider,
  type OnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { CalendarImportPrompt } from '@/components/onboarding/calendar-import-prompt'
import { AstraImportPrompt } from '@/components/onboarding/astra-import-prompt'
import { ReferralPrompt } from '@/components/referral/referral-prompt'
import { MilestoneSharePrompt } from '@/components/milestone-share/milestone-share-prompt'
import { MarketingConsentPrompt } from '@/components/marketing-consent/marketing-consent-prompt'
import { ReviewMomentSheet } from '@/components/review-moment/review-moment-sheet'
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
  showRetainedOnboarding: boolean
  onboardingActions: OnboardingActions
}

/**
 * Presentational overlay layer for the authenticated app shell. Renders every
 * global overlay in a fixed z-order, but gates each one to mount only once its
 * condition can first be true so pre-onboarding sessions never instantiate the
 * post-onboarding prompts (push, calendar-import, Astra-import, gamification).
 * The always-mounted overlays (expiry, trial-expired, version
 * update, tour) fire independently of onboarding and stay eager. This is a
 * behavior-neutral split from the root layout so the mount matrix is unit-
 * testable. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
 */
export function OverlayLayer({
  hasCompletedOnboarding,
  hasProAccess,
  showRetainedOnboarding,
  onboardingActions,
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
          <MarketingConsentPrompt />
          <ReferralPrompt />
          <MilestoneSharePrompt />
          <ReviewMomentSheet />
        </>
      ) : null}
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
