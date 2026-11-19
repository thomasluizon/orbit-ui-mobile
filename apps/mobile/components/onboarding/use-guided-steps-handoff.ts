import { useState } from 'react'
import { ONBOARDING_DONE_STEP } from '@orbit/shared/utils'
import { useWindowHandoff } from '@/components/ui/flow-window'

interface GuidedStepsHandoffInput {
  guided: boolean
  finalStepOnly: boolean
  step: number
}

/**
 * The guided steps present a `Modal` and the done shell presents through the window host. On iOS the shell waits until
 * the steps window finished its dismissal, and the steps keep the last question they showed while they leave.
 */
export function useGuidedStepsHandoff({ guided, finalStepOnly, step }: Readonly<GuidedStepsHandoffInput>) {
  const [lastQuestionStep, setLastQuestionStep] = useState(step)
  if (step < ONBOARDING_DONE_STEP && lastQuestionStep !== step) setLastQuestionStep(step)
  const { handedOver, settle } = useWindowHandoff(guided && !finalStepOnly && step === ONBOARDING_DONE_STEP)
  return { handedOver, settle, stepsStep: handedOver ? step : lastQuestionStep }
}
