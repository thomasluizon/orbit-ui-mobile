import { useWindowDimensions } from 'react-native'
import { usePanGesture } from 'react-native-gesture-handler'
import { scheduleOnRN } from 'react-native-worklets'
import { CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO } from '@orbit/shared/utils'

interface UseHorizontalSwipeOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  minDistance?: number
  edgeExclusion?: number
  minVelocity?: number
}

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  edgeExclusion = 24,
  minVelocity = 0.2,
}: Readonly<UseHorizontalSwipeOptions>) {
  const { width: screenWidth } = useWindowDimensions()

  return usePanGesture({
    activeOffsetX: [-minDistance, minDistance],
    failOffsetY: [-minDistance, minDistance],
    onDeactivate: (event) => {
      'worklet'
      const startX = event.absoluteX - event.translationX

      if (startX <= edgeExclusion) return
      if (screenWidth > 0 && startX >= screenWidth - edgeExclusion) return

      const dx = event.translationX
      const dy = event.translationY
      const vx = event.velocityX / 1000

      if (Math.abs(dx) <= Math.abs(dy) * CALENDAR_HORIZONTAL_SWIPE_DIRECTION_RATIO) return
      if (Math.abs(dx) <= minDistance) return
      if (Math.abs(vx) < minVelocity) return

      if (dx <= -minDistance) {
        scheduleOnRN(onSwipeLeft)
      } else if (dx >= minDistance) {
        scheduleOnRN(onSwipeRight)
      }
    },
  })
}
