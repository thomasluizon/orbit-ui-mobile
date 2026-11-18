import { useSyncExternalStore } from 'react'
import { isOrbitMotionEnabled, subscribeOrbitLoop } from '@orbit/shared/utils'
import { usePrefersReducedMotion } from '@/lib/motion'

/** Whether the small face read motion may run: no reduced motion and `Orbit em movimento` on. A waiting control keeps the still skeleton face when it is false. */
export function useOrbitReadMotionAllowed(): boolean {
  const reducedMotion = usePrefersReducedMotion()
  const motionEnabled = useSyncExternalStore(subscribeOrbitLoop, isOrbitMotionEnabled, isOrbitMotionEnabled)
  return !reducedMotion && motionEnabled
}
