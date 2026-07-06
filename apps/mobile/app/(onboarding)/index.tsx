import {
  OnboardingActionsProvider,
  useBufferOnboardingActions,
} from '@/components/onboarding/onboarding-actions-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'

export default function OnboardingScreen() {
  const actions = useBufferOnboardingActions()

  return (
    <OnboardingActionsProvider actions={actions} hasProAccess isLive={false}>
      <OnboardingFlow />
    </OnboardingActionsProvider>
  )
}
