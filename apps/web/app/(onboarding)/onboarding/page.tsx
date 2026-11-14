'use client'

import {
  OnboardingActionsProvider,
  useBufferOnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useFlag } from '@/hooks/use-flag'

export default function OnboardingPage() {
  const actions = useBufferOnboardingActions()
  /** Before sign-in no config exists, so the flag reads off and the current flow shows until the flag read goes away. */
  const guided = useFlag('orbit_guided_flows')

  return (
    <OnboardingActionsProvider actions={actions} isLive={false}>
      <OnboardingFlow guided={guided} />
    </OnboardingActionsProvider>
  )
}
