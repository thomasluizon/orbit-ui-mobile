'use client'

import {
  OnboardingActionsProvider,
  useLiveOnboardingActions,
} from './onboarding-actions-context'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import dynamic from 'next/dynamic'

const OnboardingFlow = dynamic(
  () => import('./onboarding-flow').then((module) => module.OnboardingFlow),
  { loading: () => null },
)

/** Post-auth onboarding overlay for existing users who have not finished onboarding. */
export function RetainedOnboardingOverlay({ finalStepOnly = false, onExit }: Readonly<{ finalStepOnly?: boolean; onExit?: () => void }>) {
  const actions = useLiveOnboardingActions()
  const accountGeneration = useAccountGeneration()

  return (
    <OnboardingActionsProvider actions={actions} isLive>
      <OnboardingFlow finalStepOnly={finalStepOnly} onExit={onExit} key={accountGeneration} />
    </OnboardingActionsProvider>
  )
}
