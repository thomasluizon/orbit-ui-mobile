'use client'

import { useSyncExternalStore } from 'react'
import { isOrbitMotionEnabled, subscribeOrbitLoop } from '@orbit/shared/utils'
import { useViewportMatch } from '@/hooks/use-viewport-match'

/** Whether the small face read motion may run: no reduced motion and `Orbit em movimento` on. A waiting control keeps the still skeleton face when it is false. */
export function useOrbitReadMotionAllowed(): boolean {
  const reducedMotion = useViewportMatch('(prefers-reduced-motion: reduce)')
  const motionEnabled = useSyncExternalStore(subscribeOrbitLoop, isOrbitMotionEnabled, isOrbitMotionEnabled)
  return !reducedMotion && motionEnabled
}
