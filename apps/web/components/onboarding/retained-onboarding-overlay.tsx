'use client'

import { useHasProAccess } from '@/hooks/use-profile'
import {
  OnboardingActionsProvider,
  useLiveOnboardingActions,
} from './onboarding-actions-context'
import { OnboardingFlow } from './onboarding-flow'

/** Post-auth onboarding overlay for existing users who have not finished onboarding. */
export function RetainedOnboardingOverlay() {
  const actions = useLiveOnboardingActions()
  const hasProAccess = useHasProAccess()

  return (
    <OnboardingActionsProvider actions={actions} hasProAccess={hasProAccess} isLive>
      <OnboardingFlow />
    </OnboardingActionsProvider>
  )
}
