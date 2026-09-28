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

export interface OverlayLayerProps {
  hasCompletedOnboarding: boolean
  showRetainedOnboarding: boolean
  onboardingActions: OnboardingActions
}

/**
 * Presentational overlay layer for the authenticated app shell. Renders every global overlay
 * in a fixed z-order, but gates each one to mount only once its condition can first be true
 * so pre-onboarding sessions never instantiate the post-onboarding prompts (calendar-import,
 * Astra-import, gamification).
 */
export function OverlayLayer({
  hasCompletedOnboarding,
  showRetainedOnboarding,
  onboardingActions,
}: Readonly<OverlayLayerProps>) {
  return (
    <>
      <ExpiryWarning />
      {!showRetainedOnboarding ? <TrialExpiredModal /> : null}
      {showRetainedOnboarding ? (
        <OnboardingActionsProvider
          actions={onboardingActions}
          isLive
        >
          <OnboardingFlow />
        </OnboardingActionsProvider>
      ) : null}
      {hasCompletedOnboarding && !showRetainedOnboarding ? (
        <>
          <MarketingConsentPrompt />
          <ReferralPrompt />
          <MilestoneSharePrompt />
          <ReviewMomentSheet />
        </>
      ) : null}
      {hasCompletedOnboarding && !showRetainedOnboarding ? (
        <>
          <CalendarImportPrompt />
          <AstraImportPrompt />
        </>
      ) : null}
      <VersionUpdateDrawer />
    </>
  )
}
