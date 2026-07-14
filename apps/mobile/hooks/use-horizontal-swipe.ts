import { useMemo } from 'react'
import { useWindowDimensions } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'

interface UseHorizontalSwipeOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  minDistance?: number
  edgeExclusion?: number
  minVelocity?: number
}

/**
 * Horizontal swipe gesture for day/month paging. Returns an RNGH `Gesture.Pan`
 * to feed a `GestureDetector`; the recognition runs on the UI thread so list
 * scrolling stays smooth. Thresholds match the prior PanResponder exactly.
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  edgeExclusion = 24,
  minVelocity = 0.2,
}: Readonly<UseHorizontalSwipeOptions>) {
  const { width: screenWidth } = useWindowDimensions()

  return useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-minDistance, minDistance])
        .failOffsetY([-minDistance, minDistance])
        .onEnd((event) => {
          'worklet'
          const startX = event.absoluteX - event.translationX

          if (startX <= edgeExclusion) return
          if (screenWidth > 0 && startX >= screenWidth - edgeExclusion) return

          const dx = event.translationX
          const dy = event.translationY
          const vx = event.velocityX / 1000

          if (Math.abs(dx) <= Math.abs(dy) * 1.2) return
          if (Math.abs(dx) <= minDistance) return
          if (Math.abs(vx) < minVelocity) return

          if (dx <= -minDistance) {
            scheduleOnRN(onSwipeLeft)
          } else if (dx >= minDistance) {
            scheduleOnRN(onSwipeRight)
          }
        }),
    [edgeExclusion, minDistance, minVelocity, onSwipeLeft, onSwipeRight, screenWidth],
  )
}
