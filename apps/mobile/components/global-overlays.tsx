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
  signedIn: boolean
  hasCompletedOnboarding: boolean
  showRetainedOnboarding: boolean
  showPendingPro?: boolean
  pendingProLoaded?: boolean
  onboardingActions: OnboardingActions
}

/**
 * Overlay layer of the app shell, in a fixed z-order. It stays mounted after sign-out: every sheet owner
 * takes `suppressed` into its open condition, so a presented sheet closes through its native dismissal
 * instead of an unmount, and the post-onboarding prompts stay closed until their gates allow them.
 */
export function OverlayLayer({
  signedIn,
  hasCompletedOnboarding,
  showRetainedOnboarding,
  showPendingPro = false,
  pendingProLoaded = true,
  onboardingActions,
}: Readonly<OverlayLayerProps>) {
  const onboardingOpen = signedIn && (showRetainedOnboarding || showPendingPro)
  const noticeSuppressed = !signedIn || onboardingOpen || !pendingProLoaded
  const promptsSuppressed = noticeSuppressed || !hasCompletedOnboarding
  return (
    <>
      {signedIn ? <ExpiryWarning /> : null}
      <TrialExpiredModal suppressed={noticeSuppressed} />
      {onboardingOpen ? (
        <OnboardingActionsProvider
          actions={onboardingActions}
          isLive
        >
          <OnboardingFlow finalStepOnly={showPendingPro} />
        </OnboardingActionsProvider>
      ) : null}
      <MarketingConsentPrompt suppressed={promptsSuppressed} />
      <ReferralPrompt suppressed={promptsSuppressed} />
      <MilestoneSharePrompt suppressed={promptsSuppressed} />
      <ReviewMomentSheet suppressed={promptsSuppressed} />
      <CalendarImportPrompt suppressed={promptsSuppressed} />
      <AstraImportPrompt suppressed={promptsSuppressed} />
      <VersionUpdateDrawer suppressed={!signedIn} />
    </>
  )
}
