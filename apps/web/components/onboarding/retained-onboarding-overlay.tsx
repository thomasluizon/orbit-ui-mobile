'use client'

import {
  OnboardingActionsProvider,
  useLiveOnboardingActions,
} from './onboarding-actions-context'
import { OnboardingFlow } from './onboarding-flow'

/** Post-auth onboarding overlay for existing users who have not finished onboarding. */
export function RetainedOnboardingOverlay() {
  const actions = useLiveOnboardingActions()

  return (
    <OnboardingActionsProvider actions={actions} isLive>
      <OnboardingFlow />
    </OnboardingActionsProvider>
  )
}
