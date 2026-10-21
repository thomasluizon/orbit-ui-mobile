import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { CelebrationPresentation } from '@orbit/shared/stores'
import { getAccountGeneration, subscribeToAccountGeneration } from '@/lib/session-epoch'
import { useUIStore } from '@/stores/ui-store'

export function useCelebrationPresentation(id: string, daily: boolean, reduced: boolean, complete: () => void) {
  const [presentation] = useState(() => {
    const generation = getAccountGeneration()
    return new CelebrationPresentation({ daily, reduced, complete,
      isCurrent: () => generation === getAccountGeneration() && useUIStore.getState().activeCelebration?.id === id })
  })
  const snapshot = useSyncExternalStore(presentation.subscribe, presentation.getSnapshot, presentation.getSnapshot)
  useLayoutEffect(() => {
    presentation.start(AppState.currentState !== 'active')
    const unsubscribe = subscribeToAccountGeneration(presentation.stop)
    const subscription = AppState.addEventListener('change', (state) => presentation.setHidden(state !== 'active'))
    return () => { presentation.stop(); unsubscribe(); subscription.remove() }
  }, [presentation])
  useLayoutEffect(() => presentation.setReducedMotion(reduced), [presentation, reduced])
  return { presentation, snapshot }
}
