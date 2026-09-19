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
   * The flow is keyed to the account, so an account replacement under a running tab unmounts it.
   * Its nineteen fields carry the typed habit, its schedule and the id of a habit already created
   * under the previous account, and `pushRegistrationFailed` can hold the overlay open across the
   * change. One key drops all nineteen; nineteen resets is nineteen chances to forget one.
   */
  const accountGeneration = useAccountGeneration()

  return (
    <OnboardingActionsProvider actions={actions} isLive>
      <OnboardingFlow key={accountGeneration} />
    </OnboardingActionsProvider>
  )
}
