import {
  OnboardingActionsProvider,
  useBufferOnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { useFlag } from '@/hooks/use-flag'

export default function OnboardingScreen() {
  const actions = useBufferOnboardingActions()
  const guided = useFlag('orbit_guided_flows')

  return (
    <OnboardingActionsProvider actions={actions} isLive={false}>
      <OnboardingFlow guided={guided} />
    </OnboardingActionsProvider>
  )
}
