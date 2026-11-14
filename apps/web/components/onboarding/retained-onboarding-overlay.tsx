'use client'

import {
  OnboardingActionsProvider,
  useLiveOnboardingActions,
} from './onboarding-actions-context'
import { useAccountGeneration } from '@/hooks/use-session-reset'
import { useFlag } from '@/hooks/use-flag'
import dynamic from 'next/dynamic'

const OnboardingFlow = dynamic(
  () => import('./onboarding-flow').then((module) => module.OnboardingFlow),
  { loading: () => null },
)

/** Post-auth onboarding overlay for existing users who have not finished onboarding. */
export function RetainedOnboardingOverlay({ finalStepOnly = false, onExit }: Readonly<{ finalStepOnly?: boolean; onExit?: () => void }>) {
  const actions = useLiveOnboardingActions()
  /**
   * The flow is keyed to the account, so an account replacement under a running tab remounts
   * it and drops all nineteen of its `useState` fields at once, rather than through nineteen
   * resets that are nineteen chances to forget one. The remount is not a clean slate.
   */
  const accountGeneration = useAccountGeneration()
  const guided = useFlag('orbit_guided_flows')

  return (
    <OnboardingActionsProvider actions={actions} isLive>
      <OnboardingFlow finalStepOnly={finalStepOnly} onExit={onExit} guided={guided} key={accountGeneration} />
    </OnboardingActionsProvider>
  )
}
