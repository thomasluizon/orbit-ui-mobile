import { useEffect, useEffectEvent } from 'react'

let activeNavigationGuard: ((action: () => void) => void) | null = null

export function requestHabitCreateNavigation(action: () => void, creationExit: () => void) {
  if (activeNavigationGuard) activeNavigationGuard(creationExit)
  else action()
}

export function useHabitCreateNavigationGuard({ active, leaving, onNavigate }: Readonly<{
  active: boolean
  leaving: boolean
  onNavigate: (action: () => void) => void
}>) {
  const requestNavigation = useEffectEvent(onNavigate)
  const isLeaving = useEffectEvent(() => leaving)
  useEffect(() => {
    if (!active) return
    activeNavigationGuard = (action) => {
      if (isLeaving()) action()
      else requestNavigation(action)
    }
    return () => { activeNavigationGuard = null }
  }, [active])
}
