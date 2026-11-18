import { ONBOARDING_WHAT_STEP } from '../utils/onboarding'
import { onboardingInitialView, onboardingViewAfterStep, type OnboardingFlowView, type OnboardingGuidedNavigation } from '../utils/onboarding-guided'
import type { StateHook } from './state-adapter'

/** `readIntroSeen` runs once, on the first render. `readNeedsCadence` runs on each step change of `OnboardingFlow` and on each settled read of the phrase. `phraseReads` counts the settled reads, because a phrase edited from the summary settles with no step change. */
export interface GuidedOnboardingNavigationInput {
  step: number
  phraseReads: number
  readIntroSeen: () => boolean
  readNeedsCadence: () => boolean
}

/** The view, the first-run intro, a move to a view, and the back action of a back target: a view, the previous step of `OnboardingFlow`, or none. */
export interface GuidedOnboardingNavigationState {
  navigation: OnboardingGuidedNavigation
  introRun: boolean
  go: (view: OnboardingFlowView, direction: 1 | -1, patch?: Partial<OnboardingGuidedNavigation>) => void
  backAction: (target: OnboardingFlowView | 'step' | null, onStepBack: (() => void) | undefined) => (() => void) | undefined
}

/** The view of the guided onboarding. It follows each step change of `OnboardingFlow` and moves between the views inside a step. */
export function createUseGuidedOnboardingNavigation({ useState }: { useState: StateHook }): (input: GuidedOnboardingNavigationInput) => GuidedOnboardingNavigationState {
  return function useGuidedOnboardingNavigation({ step, phraseReads, readIntroSeen, readNeedsCadence }: GuidedOnboardingNavigationInput): GuidedOnboardingNavigationState {
    const [introRun] = useState(() => step === ONBOARDING_WHAT_STEP && !readIntroSeen())
    const [navigation, setNavigation] = useState<OnboardingGuidedNavigation>(() => ({ view: onboardingInitialView(step, introRun), direction: 1, cadencePath: [], editing: false, walking: false, pendingEdit: null }))
    const [trackedStep, setTrackedStep] = useState(step)
    const [trackedReads, setTrackedReads] = useState(phraseReads)
    if (trackedStep !== step || trackedReads !== phraseReads) {
      const previous = trackedStep === step ? ONBOARDING_WHAT_STEP : trackedStep
      setTrackedStep(step)
      setTrackedReads(phraseReads)
      setNavigation((current) => onboardingViewAfterStep(current, previous, step, readNeedsCadence()))
    }
    const go = (view: OnboardingFlowView, direction: 1 | -1, patch: Partial<OnboardingGuidedNavigation> = {}) => setNavigation((current) => ({ ...current, ...patch, view, direction }))
    const backAction: GuidedOnboardingNavigationState['backAction'] = (target, onStepBack) => {
      if (target === null) return undefined
      if (target !== 'step') return () => go(target, -1, { editing: false })
      return onStepBack
    }
    return { navigation, introRun, go, backAction }
  }
}
