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
   * The flow is keyed to the account, so an account replacement under a running tab remounts it and
   * drops all nineteen of its `useState` fields at once, rather than through nineteen resets that
   * are nineteen chances to forget one.
   *
   * The remount is not a clean slate. `onboarding-flow.tsx:139-140` read `pushRegistrationFailed`
   * and the first drafted habit out of `useOnboardingDraftStore`, which no key clears, and `:141`,
   * `:145`, `:148`, `:151`, `:152` and `:155` seed six of those fields from them. So the previous
   * account's deferred push failure reopens this overlay under the next account, with that
   * account's habit title in it. The key cannot reach that store; clearing it is
   * https://github.com/thomasluizon/orbit-tickets/issues/600.
   */
  const accountGeneration = useAccountGeneration()

  return (
    <OnboardingActionsProvider actions={actions} isLive>
      <OnboardingFlow key={accountGeneration} />
    </OnboardingActionsProvider>
  )
}
