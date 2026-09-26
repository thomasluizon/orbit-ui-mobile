'use client'

import {
  OnboardingActionsProvider,
  useLiveOnboardingActions,
} from './onboarding-actions-context'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { OnboardingFlow } from './onboarding-flow'

/** Post-auth onboarding overlay for existing users who have not finished onboarding. */
export function RetainedOnboardingOverlay() {
  const actions = useLiveOnboardingActions()
  /**
   * The flow is keyed to the account, so an account replacement under a running tab remounts
   * it and drops all nineteen of its `useState` fields at once, rather than through nineteen
   * resets that are nineteen chances to forget one. The remount is not a clean slate.
   */
  const accountGeneration = useAccountGeneration()

  return (
    <OnboardingActionsProvider actions={actions} isLive>
      <OnboardingFlow key={accountGeneration} />
    </OnboardingActionsProvider>
  )
}
